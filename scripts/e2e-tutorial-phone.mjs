#!/usr/bin/env node
/**
 * Walk the tutorial's phone program the way a thumb does (CI step 18, after `e2e:tutorial`).
 *
 * `## The whole file, on a phone` is a second complete program, and it exists because three things
 * that only go wrong on a phone — `fitToWindow`'s `onResize` hook, `measureCanvas`, and
 * `toCanvasPoint` — used to be snippets spliced into the desktop program, so nothing compiled or
 * ran them. `pnpm -r typecheck` and `pnpm -r build` now compile it (the fixture extracts the block
 * verbatim); this file proves it *runs*, and that the wiring is the wiring.
 *
 *   T12 at 390×844 with touch and DPR 3, the canvas is the window and it painted
 *   T13 frames keep coming — a running game, not a still figure
 *   T14 a thumb on the right zone walks the body right while the camera holds it, and the world
 *       slides left: the whole chain from the touch through the pad into `stepBody`
 *   T15 a thumb on the jump zone lifts the body off the floor (`jump` is the edge, not the hold)
 *   T16 after the window grows to 414 px the canvas follows it, and a point that is inside the pad
 *       *only* at the new width still walks — which only happens if `onResize` rebuilt the pad
 *   T17 a canvas styled to half its bitmap width still puts the thumb in the zone drawn under it;
 *       the page hands the program CSS pixels and the program hands the pad bitmap pixels, so this
 *       is `measureCanvas`/`toCanvasPoint` doing their job rather than merely being called
 *   T18 no page errors on any of it
 *
 * The pad's coordinates come from probing the doc's own `buildPad` (the same walk `e2e:tutorial`
 * does at four widths) — this file never repeats the size arithmetic, so a document that changes
 * its formula moves the gate with it.
 *
 * Usage: `pnpm e2e:tutorial` (runs this after `e2e-tutorial.mjs`, needs `pnpm -r build`).
 * `E2E_CHROMIUM=/path/to/chrome` overrides the browser, exactly like `e2e:demo`.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { chromium } from "playwright-core";

import { serveDist } from "./lib/static-server.mjs";

const HERE = import.meta.dirname ?? new URL(".", import.meta.url).pathname;
const ROOT = resolve(HERE, "..");
const DIST = join(ROOT, "fixtures", "tutorial", "dist");
const PORT = Number(process.env.E2E_TUTORIAL_PHONE_PORT ?? 4322);

const CLEAR = [13, 22, 38]; // "#0d1626"
const SOLID = [42, 53, 80]; // "#2a3550"
const PLAYER = [247, 179, 43]; // "#f7b32b"

const PHONE = { width: 390, height: 844 };
const WIDER = { width: 414, height: 844 };

const PHONE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const failures = [];

function check(ok, name, detail) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Count frames by wrapping rAF before the page's own script runs. */
const COUNT_FRAMES = `(() => {
  let frames = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => raf((time) => {
    frames += 1;
    return callback(time);
  });
  window.__frames = () => frames;
})();`;

/**
 * One read of the whole canvas: the three colours, where the body is, and a fingerprint of the
 * world. The fingerprint is what makes "did the world move at all" a comparison rather than a
 * threshold: the visible edges of the level pull a centroid back as the tiles scroll out of view.
 */
const SAMPLE = `(() => {
  const canvas = document.querySelector("#game");
  if (!canvas) return { error: "no #game canvas" };
  const context = canvas.getContext("2d");
  if (!context) return { error: "no 2d context" };

  const { width, height } = canvas;
  const { data } = context.getImageData(0, 0, width, height);
  const counts = { clear: 0, solid: 0, player: 0 };
  const bands = new Array(Math.ceil(width / 16)).fill(0);
  let solidX = 0;
  let minX = width;
  let maxX = -1;
  let maxY = -1;

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const pixel = (index / 4) % width;
    const row = Math.floor(index / 4 / width);

    if (r === ${CLEAR[0]} && g === ${CLEAR[1]} && b === ${CLEAR[2]}) counts.clear += 1;
    else if (r === ${SOLID[0]} && g === ${SOLID[1]} && b === ${SOLID[2]}) {
      counts.solid += 1;
      solidX += pixel;
      bands[Math.floor(pixel / 16)] = 1;
    } else if (r === ${PLAYER[0]} && g === ${PLAYER[1]} && b === ${PLAYER[2]}) {
      counts.player += 1;
      if (pixel < minX) minX = pixel;
      if (pixel > maxX) maxX = pixel;
      if (row > maxY) maxY = row;
    }
  }

  return {
    width,
    height,
    counts,
    body: maxX >= 0 ? { minX, maxX, maxY } : null,
    solidCentreX: counts.solid > 0 ? solidX / counts.solid : null,
    worldSignature: bands.join(""),
    frames: window.__frames?.() ?? null,
  };
})()`;

/** Did the world move between two samples? A finger that never reached the pad moves it by zero. */
function worldMoved(before, after) {
  const shift = before.solidCentreX - after.solidCentreX;

  return { moved: before.worldSignature !== after.worldSignature || Math.abs(shift) > 8, shift };
}

/**
 * Hold a thumb on one point, then lift it.
 *
 * `page.touchscreen.tap` sends touchstart and touchend in the same tick, and a game that samples
 * "which fingers are down this frame" never sees it — the press has to survive frames.
 */
async function touchHold(page, point, ms) {
  const client = await page.context().newCDPSession(page);
  try {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: point.x, y: point.y, radiusX: 6, radiusY: 6, force: 1 }],
    });
    await page.waitForTimeout(ms);
  } finally {
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await client.detach().catch(() => {});
  }
}

/** The centre of one probed zone — a point the pad itself said answers. */
function zoneCentre(probe, name) {
  const span = probe[name];
  return { x: (span.minX + span.maxX) / 2, y: (span.minY + span.maxY) / 2 };
}

/**
 * The zones the document's `buildPad` produces at one width, walked point by point.
 *
 * Each probe is a fresh pad and one pointer, and the sweep is dense in x because the question is
 * where the boundaries are. Nothing here knows the size formula.
 */
async function probeZones(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { ...PHONE }, hasTouch: true });
  try {
    await page.goto(`${baseUrl}/phone.html`, { waitUntil: "load" });
    await page.waitForFunction(() => typeof window.__buildPad === "function", undefined, { timeout: 10_000 });

    return await page.evaluate(
      ({ widths, height }) => {
        const buildPad = window.__buildPad;
        const names = ["left", "right", "jump"];

        return Object.fromEntries(
          widths.map((width) => {
            const spans = Object.fromEntries(
              names.map((name) => [name, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }]),
            );

            for (let x = 0; x <= width; x += 2) {
              for (let y = Math.max(0, height - 200); y <= height; y += 8) {
                const pad = buildPad(width, height);
                pad.update([{ id: 1, x, y }], 1 / 60);

                for (const name of names) {
                  if (!pad.down(name)) continue;
                  const span = spans[name];
                  if (x < span.minX) span.minX = x;
                  if (x > span.maxX) span.maxX = x;
                  if (y < span.minY) span.minY = y;
                  if (y > span.maxY) span.maxY = y;
                }
              }
            }

            return [width, spans];
          }),
        );
      },
      { widths: [PHONE.width, WIDER.width], height: PHONE.height },
    );
  } finally {
    await page.close();
  }
}

async function main() {
  if (!existsSync(join(DIST, "index.html"))) {
    throw new Error(`no built tutorial at ${DIST} — run \`pnpm -r build\` first`);
  }

  const { server, missing } = await serveDist({ root: DIST, port: PORT });
  const baseUrl = `http://127.0.0.1:${PORT}`;

  const executablePath = process.env.E2E_CHROMIUM;
  const launch = { args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio"] };
  const browser = executablePath
    ? await chromium.launch({ ...launch, executablePath })
    : await chromium.launch({ ...launch, channel: process.env.E2E_CHANNEL ?? "chrome" });

  try {
    check(missing.length === 0, "T12: every asset the phone pages asked for was served", missing.slice(0, 3).join(" | "));

    const zones = await probeZones(browser, baseUrl);

    const context = await browser.newContext({
      viewport: { ...PHONE },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: PHONE_USER_AGENT,
    });

    try {
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      await page.addInitScript(COUNT_FRAMES);
      await page.goto(`${baseUrl}/phone-whole.html`, { waitUntil: "load" });

      let first = null;
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        first = await page.evaluate(SAMPLE);
        if (first.error === undefined && first.counts.player > 0 && first.counts.solid > 0) break;
        await page.waitForTimeout(100);
      }
      if (first?.error !== undefined) throw new Error(first.error);

      check(
        first.width === PHONE.width && first.height === PHONE.height,
        "T13: the phone program's canvas is the window at 390×844",
        `${first.width}×${first.height}`,
      );
      check(
        first.counts.clear > 0 && first.counts.solid > 0 && first.counts.player > 0,
        "T14: the phone program painted the frame",
        `clear ${first.counts.clear}px, solid ${first.counts.solid}px, player ${first.counts.player}px`,
      );

      const tickBefore = await page.evaluate(SAMPLE);
      await page.waitForTimeout(400);
      const tickAfter = await page.evaluate(SAMPLE);
      check(
        tickBefore.frames !== null && tickAfter.frames - tickBefore.frames >= 4,
        "T15: frames keep coming on the phone program",
        `${tickBefore.frames} → ${tickAfter.frames} rAF callbacks in 400 ms`,
      );

      const pad390 = zones[PHONE.width];

      await page.waitForTimeout(300);
      const still = await page.evaluate(SAMPLE);
      await touchHold(page, zoneCentre(pad390, "right"), 500);
      const running = await page.evaluate(SAMPLE);

      const bodyShift = Math.abs(running.body.minX - still.body.minX);
      const worldShift = still.solidCentreX - running.solidCentreX;
      check(
        worldShift > 30 && bodyShift < 12,
        "T16: a thumb on the right zone walks right — the world slides left",
        `world moved ${worldShift.toFixed(1)}px left, body moved ${bodyShift.toFixed(1)}px on screen`,
      );

      const ground = await page.evaluate(SAMPLE);
      await touchHold(page, zoneCentre(pad390, "jump"), 140);

      let apex = ground;
      for (let sample = 0; sample < 12; sample += 1) {
        const frame = await page.evaluate(SAMPLE);
        if (frame.body !== null && frame.body.maxY < apex.body.maxY) apex = frame;
        await page.waitForTimeout(40);
      }

      check(
        ground.body !== null && ground.body.maxY - apex.body.maxY > 20,
        "T17: a thumb on the jump zone lifts the body",
        `lowest ${ground.body?.maxY} → highest ${apex.body?.maxY} (row of the lowest player pixel)`,
      );

      // A point inside the pad at 414 px and outside it at 390: only a rebuilt pad answers there.
      const pad414 = zones[WIDER.width];
      const grown = {
        x: (pad390.left.maxX + pad414.left.maxX) / 2,
        y: (pad414.left.minY + pad414.left.maxY) / 2,
      };

      await page.setViewportSize({ ...WIDER });

      const grownDeadline = Date.now() + 5_000;
      let resized = await page.evaluate(SAMPLE);
      while (Date.now() < grownDeadline && (resized.width !== WIDER.width || resized.height !== WIDER.height)) {
        await page.waitForTimeout(100);
        resized = await page.evaluate(SAMPLE);
      }

      check(
        resized.width === WIDER.width && resized.height === WIDER.height,
        "T18: the canvas follows the window after a resize",
        `${first.width}×${first.height} → ${resized.width}×${resized.height}`,
      );

      const beforeGrown = await page.evaluate(SAMPLE);
      await touchHold(page, grown, 500);
      const afterGrown = await page.evaluate(SAMPLE);
      const grownMove = worldMoved(beforeGrown, afterGrown);

      check(
        grownMove.moved,
        "T19: after the resize, the pad point that only exists at the new width still walks the body",
        `x=${grown.x.toFixed(1)}: world ${grownMove.moved ? "moved" : "did not move"} (centroid ${grownMove.shift.toFixed(1)}px)`,
      );

      // The reader's page will style the canvas; the program draws in bitmap pixels and receives
      // pointers in CSS pixels. Half the CSS width makes that difference visible: a thumb at CSS
      // (100, 380) is bitmap (200, 760), which is the right zone — an unconverted pointer is neither
      // zone, so nothing moves.
      await page.evaluate(() => {
        document.querySelector("#game").style.width = "50%";
      });

      const cssPoint = {
        x: (pad414.right.minX + pad414.right.maxX) / 2 / 2,
        y: (pad414.right.minY + pad414.right.maxY) / 2 / 2,
      };
      const beforeScaled = await page.evaluate(SAMPLE);
      await touchHold(page, cssPoint, 700);
      const afterScaled = await page.evaluate(SAMPLE);
      const scaledMove = worldMoved(beforeScaled, afterScaled);

      check(
        scaledMove.moved,
        "T20: a canvas at half its CSS size puts the thumb in the zone drawn under it",
        `css ${cssPoint.x.toFixed(1)},${cssPoint.y.toFixed(1)}: world ${scaledMove.moved ? "moved" : "did not move"} (centroid ${scaledMove.shift.toFixed(1)}px)`,
      );

      check(pageErrors.length === 0, "T21: no page errors on the phone program", pageErrors.slice(0, 2).join(" | "));
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (failures.length > 0) {
    console.error(`e2e:tutorial-phone failed: ${failures.length} check(s)`);
    process.exitCode = 1;
  } else {
    console.log("e2e:tutorial-phone passed");
  }
}

await main();
