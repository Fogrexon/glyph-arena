#!/usr/bin/env node
/**
 * Run the tutorial's "The whole file" program in a real browser (CI step 10).
 *
 * `pnpm -r typecheck` and `pnpm -r build` already prove the block compiles and bundles. They do not
 * prove that it *runs*: the two breakages that reached readers this week — a spawn inside the floor
 * and `jump` fed the held state — both compiled. So this step serves the built fixture from
 * 127.0.0.1 and reads the canvas the reader would see.
 *
 * What it asserts, in the tutorial's own colours (`#0d1626` clear, `#2a3550` solid, `#f7b32b`
 * player), so no debug hook is needed and nothing about the frame is assumed beyond the block:
 *
 *   T1 the canvas has a bitmap the size of the window
 *   T2 the frame painted: the clear colour and at least one solid tile
 *   T3 the body was drawn
 *   T4 frames keep coming (requestAnimationFrame advances)
 *   T5 holding ArrowRight moves the body through the world: the camera keeps the body at the same
 *      screen spot while the tiles slide left — which only happens if input reaches `stepBody`
 *   T6 no page or console errors other than failed resource loads
 *   T7 nothing the page asked for was missing (the server saw every response < 400)
 *   T8 at 390×844 (touch, DPR 3) the canvas is the window — the phone viewport the tutorial
 *      promises to work in
 *   T9 that page painted
 *   T10 frames keep coming there too
 *   T11 the pad the phone section builds has **no point that belongs to two zones**, at 360, 390,
 *       414 and 432 px, and all three zones answer somewhere
 *
 * T11 exists because the same file broke for people outside this repo: `size = 120` needs 432 px of
 * screen, so on a 390 px phone the right zone and the jump zone overlapped by 30 px (60 px at 360),
 * and a thumb in the overlap walked *and* jumped. The doc now derives the size from the width; this
 * check walks the zones of the block the doc publishes, at the widths where the constant failed.
 *
 * T5 is the one that catches the "it compiles but the world never steps" class, and it has to be
 * that one: the tutorial's body spawns already standing on a tile, so "it is on the floor" is true
 * on frame 0 too. (A first version asserted exactly that, and a build with `stepBody` deleted
 * passed it.) What cannot be true without stepping is *motion*: press right, and the body must run
 * — the camera then holds it at a fixed screen spot while the world slides under it.
 *
 * Usage: `pnpm e2e:tutorial` (needs `pnpm -r build`). `E2E_CHROMIUM=/path/to/chrome` overrides the
 * browser, exactly like `e2e:demo`.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { chromium } from "playwright-core";

import { requireFresh } from "./lib/build-stamp.mjs";
import { serveDist } from "./lib/static-server.mjs";

const HERE = import.meta.dirname ?? new URL(".", import.meta.url).pathname;
const ROOT = resolve(HERE, "..");
const DIST = join(ROOT, "fixtures", "tutorial", "dist");

// The fixture is extracted from docs/tutorial.md at build time: a gate run without that build
// would test the previous program and still say PASS (QA hit exactly that).
requireFresh("tutorial", ROOT, { dist: DIST, label: "e2e:tutorial" });
const PORT = Number(process.env.E2E_TUTORIAL_PORT ?? 4321);

const CLEAR = [13, 22, 38]; // "#0d1626"
const SOLID = [42, 53, 80]; // "#2a3550"
const PLAYER = [247, 179, 43]; // "#f7b32b"

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
 * One read of the whole canvas: how much of each colour is on it, where the body is, and where the
 * solid field sits. Runs in the page because the pixels are there.
 */
const SAMPLE = `(() => {
  const canvas = document.querySelector("#game");
  if (!canvas) return { error: "no #game canvas" };
  const context = canvas.getContext("2d");
  if (!context) return { error: "no 2d context" };

  const { width, height } = canvas;
  const { data } = context.getImageData(0, 0, width, height);
  const counts = { clear: 0, solid: 0, player: 0 };
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
    }
    else if (r === ${PLAYER[0]} && g === ${PLAYER[1]} && b === ${PLAYER[2]}) {
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
    frames: window.__frames?.() ?? null,
  };
})()`;


/** The phone viewport the tutorial's "On a phone" section is written for. */
const PHONE = { width: 390, height: 844 };

/** The widths where a constant 120 px pad used to overlap: 432 is the first that fits. */
const PAD_WIDTHS = [360, 390, 414, 432];

const PHONE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/**
 * T8–T10: the tutorial's own program, in a phone-sized touch viewport.
 *
 * The 30-minute promise is "a canvas and a body", and the section after it starts "a phone has no
 * keyboard" — so the program above has to survive the viewport before the pad is even considered.
 */
async function runPhoneViewport(browser, baseUrl) {
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
    await page.goto(baseUrl, { waitUntil: "load" });

    let first = null;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      first = await page.evaluate(SAMPLE);
      if (first.error === undefined && first.counts.player > 0) break;
      await page.waitForTimeout(100);
    }
    if (first?.error !== undefined) throw new Error(first.error);

    check(
      first.width === PHONE.width && first.height === PHONE.height,
      "T8: at 390×844 the canvas is the window",
      `${first.width}×${first.height}`,
    );
    check(
      first.counts.clear > 0 && first.counts.solid > 0 && first.counts.player > 0,
      "T9: the phone-sized page painted the tutorial's frame",
      `clear ${first.counts.clear}px, solid ${first.counts.solid}px, player ${first.counts.player}px`,
    );

    const before = await page.evaluate(SAMPLE);
    await page.waitForTimeout(400);
    const after = await page.evaluate(SAMPLE);
    check(
      before.frames !== null && after.frames - before.frames >= 4,
      "T10: frames keep coming at 390×844",
      `${before.frames} → ${after.frames} rAF callbacks in 400 ms`,
    );
    check(pageErrors.length === 0, "T10b: no page errors on the phone", pageErrors.slice(0, 2).join(" | "));
  } finally {
    await context.close();
  }
}

/**
 * T11: the zones the published `buildPad` produces, probed point by point.
 *
 * `buildPad` comes from the tutorial's `On a phone` block, packaged by the fixture. Each probe is a
 * fresh pad and one pointer, so "two zones answered" is a property of the geometry, not of a finger
 * that lingered. The y sweep is wide because the block's own `y` comes from the same size — the
 * gate does not repeat that formula, it walks the pad and lets the zones speak.
 */
async function runPadZones(browser, baseUrl) {
  // The same ratio the phone runs at, so buildPad is given the canvas it will really be given.
  const page = await browser.newPage({ viewport: { ...PHONE }, deviceScaleFactor: 3, hasTouch: true });
  try {
    await page.goto(`${baseUrl}/phone.html`, { waitUntil: "load" });
    await page.waitForFunction(() => typeof window.__buildPad === "function", undefined, { timeout: 10_000 });

    const measured = await page.evaluate(
      ({ widths, height }) => {
        const buildPad = window.__buildPad;
        const names = ["left", "right", "jump"];

        return widths.map((width) => {
          const spans = Object.fromEntries(names.map((name) => [name, { minX: Infinity, maxX: -Infinity, hits: 0 }]));
          let overlaps = 0;
          let firstOverlap = null;

          for (let x = 0; x <= width; x += 2) {
            for (let y = Math.max(0, height - 200); y <= height; y += 8) {
              const pad = buildPad(width, height);
              pad.update([{ id: 1, x, y }], 1 / 60);
              const down = names.filter((name) => pad.down(name));

              for (const name of down) {
                const span = spans[name];
                span.hits += 1;
                if (x < span.minX) span.minX = x;
                if (x > span.maxX) span.maxX = x;
              }
              if (down.length > 1) {
                overlaps += 1;
                if (firstOverlap === null) firstOverlap = { x, y, down };
              }
            }
          }

          return { width, spans, overlaps, firstOverlap };
        });
      },
      // Canvas pixels, because that is what buildPad is given: the pad converts a thumb's CSS pixels
      // itself, so the probe hands it the bitmap a 3x phone would produce.
      { widths: PAD_WIDTHS.map((width) => width * 3), height: PHONE.height * 3 },
    );

    for (const entry of measured) {
      const silent = ["left", "right", "jump"].filter((name) => entry.spans[name].hits === 0);
      const zones = ["left", "right", "jump"]
        .map((name) => `${name} ${entry.spans[name].minX}–${entry.spans[name].maxX}`)
        .join(" / ");

      check(
        entry.overlaps === 0 && silent.length === 0,
        `T11: at ${entry.width / 3}px (x3) no point belongs to two pad zones`,
        entry.overlaps > 0
          ? `${entry.overlaps} point(s) answered twice, e.g. ${JSON.stringify(entry.firstOverlap)}`
          : `${silent.join(", ")} never answered`,
      );
      console.log(`     ${entry.width / 3}px CSS (${entry.width}px bitmap): ${zones}`);
    }
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
  const errors = [];
  const launch = {
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio"],
  };

  const executablePath = process.env.E2E_CHROMIUM;
  const browser = executablePath
    ? await chromium.launch({ ...launch, executablePath })
    : await chromium.launch({ ...launch, channel: process.env.E2E_CHANNEL ?? "chrome" });

  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    page.on("console", (message) => {
      // "Failed to load resource" is what a 404 looks like from the page; the server-side list in
      // T7 names the URL, so this line would only duplicate it without the detail.
      if (message.type() === "error" && !/Failed to load resource/.test(message.text())) {
        errors.push(`console: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

    await page.addInitScript(COUNT_FRAMES);
    await page.goto(baseUrl, { waitUntil: "load" });

    // The first paint comes from the block's own loop; wait for it rather than guessing a delay.
    let first = null;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      first = await page.evaluate(SAMPLE);
      if (first.error === undefined && first.counts.player > 0 && first.counts.solid > 0) break;
      await page.waitForTimeout(100);
    }

    if (first?.error !== undefined) throw new Error(first.error);

    check(first.width > 0 && first.height > 0, "T1: the canvas is the size of the window", `${first.width}×${first.height}`);
    check(
      first.counts.clear > 0 && first.counts.solid > 0,
      "T2: the frame painted (clear colour and a solid tile)",
      `clear ${first.counts.clear}px, solid ${first.counts.solid}px`,
    );
    check(first.counts.player > 0, "T3: the body is on the canvas", `player ${first.counts.player}px`);

    const before = await page.evaluate(SAMPLE);
    await page.waitForTimeout(400);
    const after = await page.evaluate(SAMPLE);
    check(
      before.frames !== null && after.frames - before.frames >= 4,
      "T4: frames keep coming",
      `${before.frames} → ${after.frames} rAF callbacks in 400 ms`,
    );

    // Motion is the thing a compiler cannot fake: hold right and the world has to slide under a
    // body the camera keeps in place.
    await page.waitForTimeout(300);
    const still = await page.evaluate(SAMPLE);
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(600);
    const running = await page.evaluate(SAMPLE);
    await page.keyboard.up("ArrowRight");

    const bodyShift = Math.abs(running.body.minX - still.body.minX);
    const worldShift = still.solidCentreX - running.solidCentreX;
    check(
      worldShift > 30 && bodyShift < 12,
      "T5: holding ArrowRight moves the body through the world",
      `world moved ${worldShift.toFixed(1)}px left, body moved ${bodyShift.toFixed(1)}px on screen`,
    );

    check(errors.length === 0, "T6: no console or page errors", errors.slice(0, 3).join(" | "));
    check(missing.length === 0, "T7: every asset the page asked for was served", missing.slice(0, 3).join(" | "));

    await runPhoneViewport(browser, baseUrl);
    await runPadZones(browser, baseUrl);
  } finally {
    await browser.close();
    server.close();
  }

  if (failures.length > 0) {
    console.error(`e2e:tutorial failed: ${failures.length} check(s)`);
    process.exitCode = 1;
  } else {
    console.log("e2e:tutorial passed");
  }
}

main().catch((error) => {
  console.error(`e2e:tutorial crashed: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
