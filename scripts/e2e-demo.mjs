#!/usr/bin/env node
/**
 * End-to-end run of the built pickup demo in a real browser (CI step 8).
 *
 * Why it exists: the acceptance numbers for the demo (3 s hazard grace,
 * "standing still gets you hit", dash speed, touch start + d-pad) were measured
 * by hand in a throwaway Pod, so they were proved exactly once. This repeats
 * them on every push, against the **built** bundle, with no network: it serves
 * `examples/pickup-demo/dist` from 127.0.0.1 and drives the browser through
 * `playwright-core`, which downloads nothing (the runner's Chrome is used).
 *
 * Determinism comes from reading the game's own state instead of the wall
 * clock. A probe injected before the page loads records, for every frame, the
 * HUD text and the world position of the player and the hazards; every
 * assertion is then expressed in *simulated* time (`Time:` from the HUD) or in
 * world units, so a slow machine changes how long the run takes, never what it
 * concludes. Frames are boundaries of the demo's own `draw.clear()` call.
 *
 * The probe patches four canvas methods (see PROBE):
 *   fillRect / clearRect covering the canvas -> frame boundary
 *   drawImage 28x28                          -> player (world position)
 *   drawImage 32x32                          -> hazards (world positions)
 *   fillText                                 -> HUD text
 *
 * Usage: `pnpm e2e:demo` (needs a built demo). `E2E_CHROMIUM=/path/to/chrome`
 * overrides the browser; `E2E_KEEP=1` leaves the last screenshot behind.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve, sep } from "node:path";

import { chromium } from "playwright-core";

const HERE = import.meta.dirname ?? new URL(".", import.meta.url).pathname;
const ROOT = resolve(HERE, "..");
const DIST = join(ROOT, "examples", "pickup-demo", "dist");
const PORT = Number(process.env.E2E_PORT ?? 4317);

const PLAYER_SIZE = 28;
const HAZARD_SIZE = 32;
const HAZARD_GRACE_SECONDS = 3;
const ROUND_SECONDS = 60;

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json"],
]);

const PROBE = `(() => {
  const frames = [];
  let current = null;
  const proto = CanvasRenderingContext2D.prototype;
  const fillRect = proto.fillRect;
  const clearRect = proto.clearRect;
  const drawImage = proto.drawImage;
  const fillText = proto.fillText;

  Object.defineProperty(window, "__e2e", {
    configurable: true,
    value: {
      frames,
      reset() {
        frames.length = 0;
      },
    },
  });

  function openFrame(context, x, y, width, height) {
    if (
      x !== 0 ||
      y !== 0 ||
      width !== context.canvas.width ||
      height !== context.canvas.height
    ) {
      return;
    }
    current = { at: performance.now(), texts: [], hazards: [], player: null };
    frames.push(current);
    if (frames.length > 8000) frames.splice(0, 3000);
  }

  proto.fillRect = function (x, y, width, height) {
    openFrame(this, x, y, width, height);
    return fillRect.apply(this, arguments);
  };

  proto.clearRect = function (x, y, width, height) {
    openFrame(this, x, y, width, height);
    return clearRect.apply(this, arguments);
  };

  proto.drawImage = function () {
    const args = arguments;
    let dx;
    let dy;
    let dw;
    let dh;
    if (args.length === 9) {
      dx = args[5];
      dy = args[6];
      dw = args[7];
      dh = args[8];
    } else if (args.length === 5) {
      dx = args[1];
      dy = args[2];
      dw = args[3];
      dh = args[4];
    }
    if (current !== null && typeof dw === "number" && typeof dh === "number") {
      const width = Math.round(dw);
      const height = Math.round(dh);
      if (
        (width === ${HAZARD_SIZE} && height === ${HAZARD_SIZE}) ||
        (width === ${PLAYER_SIZE} && height === ${PLAYER_SIZE})
      ) {
        // The demo composes view*world and passes it to setTransform, so the
        // node position lives in the matrix, not in dx/dy (sprites are drawn at
        // their local origin). Undo the zoom to report world units.
        const matrix = this.getTransform();
        const scaleX = matrix.a;
        const scaleY = matrix.d;
        // Skip degenerate frames (a scale tween at 0 would divide a position by
        // almost nothing and report a coordinate that is not on the field).
        if (Math.abs(scaleX) < 0.05 || Math.abs(scaleY) < 0.05) {
          return drawImage.apply(this, arguments);
        }
        const point = {
          x: matrix.e / scaleX + dx + dw / 2,
          y: matrix.f / scaleY + dy + dh / 2,
        };
        if (
          point.x > -200 &&
          point.x < 2000 &&
          point.y > -200 &&
          point.y < 2000
        ) {
          if (width === ${HAZARD_SIZE}) {
            current.hazards.push(point);
          } else {
            current.player = point;
          }
        }
      }
    }
    return drawImage.apply(this, arguments);
  };

  proto.fillText = function (text) {
    if (current !== null) current.texts.push(String(text));
    return fillText.apply(this, arguments);
  };
})();`;

const failures = [];

function check(ok, label, detail) {
  if (ok) {
    console.log(`ok   ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
    failures.push(label);
  }
}

function serveDist() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const path = resolve(DIST, relative === "" ? "index.html" : relative);
    if (!path.startsWith(DIST + sep) && path !== join(DIST, "index.html")) {
      response.writeHead(403).end("forbidden");
      return;
    }
    try {
      const body = await readFile(path);
      const type = MIME.get(path.slice(path.lastIndexOf("."))) ?? "application/octet-stream";
      response.writeHead(200, { "content-type": type, "cache-control": "no-store" }).end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });

  return new Promise((resolvePromise) => {
    server.listen(PORT, "127.0.0.1", () => resolvePromise(server));
  });
}

/** Frames as compact records; parsing happens in the page to keep the payload small. */
async function frames(page) {
  return page.evaluate(() => {
    const valueOf = (texts, prefix) => {
      for (const text of texts) {
        if (text.startsWith(prefix)) return Number(text.slice(prefix.length).trim());
      }
      return null;
    };
    return window.__e2e.frames.map((frame) => ({
      at: frame.at,
      time: valueOf(frame.texts, "Time:"),
      lives: valueOf(frame.texts, "Lives:"),
      ready: frame.texts.includes("READY"),
      title: frame.texts.includes("Pickup"),
      result:
        frame.texts.find((text) => text.startsWith("CLEAR") || text.startsWith("FAIL")) ?? null,
      hazards: frame.hazards,
      player: frame.player,
    }));
  });
}

async function waitForText(page, needle, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await page.evaluate((value) => {
      const list = window.__e2e.frames;
      for (let index = list.length - 1; index >= 0 && index >= list.length - 180; index -= 1) {
        if (list[index].texts.some((text) => text.includes(value))) return true;
      }
      return false;
    }, needle);
    if (found) return true;
    await page.waitForTimeout(50);
  }
  return false;
}

const key = (record) => `${record.x.toFixed(3)},${record.y.toFixed(3)}`;

function matchHazards(frame, expected) {
  if (frame.hazards.length !== expected.length) return false;
  const left = [...frame.hazards].map(key).sort();
  return left.join("|") === expected;
}

async function hold(page, keyName, ms) {
  // The demo polls held keys once per frame, so a press+release inside one
  // frame would be invisible: hold for a few frames.
  await page.keyboard.down(keyName);
  await page.waitForTimeout(ms);
  await page.keyboard.up(keyName);
}

async function frameCount(page) {
  return page.evaluate(() => window.__e2e.frames.length);
}

async function waitForTextAfter(page, mark, needle, timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await page.evaluate(
      ([from, value]) => {
        const list = window.__e2e.frames;
        for (let index = Math.max(from, 0); index < list.length; index += 1) {
          if (list[index].texts.some((text) => text.includes(value))) return true;
        }
        return false;
      },
      [mark, needle],
    );
    if (found) return true;
    await page.waitForTimeout(50);
  }
  return false;
}

async function waitForRoundTimeBelow(page, target, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const reached = await page.evaluate((value) => {
      const list = window.__e2e.frames;
      for (let index = list.length - 1; index >= Math.max(0, list.length - 120); index -= 1) {
        for (const text of list[index].texts) {
          if (text.startsWith("Time:")) {
            const left = Number(text.slice("Time:".length).trim());
            if (Number.isFinite(left) && left < value) return true;
          }
        }
      }
      return false;
    }, target);
    if (reached) return true;
    await page.waitForTimeout(50);
  }
  return false;
}

function positionSet(recording) {
  return new Set(
    recording.map((frame) => [...frame.hazards].map(key).sort().join("|")),
  );
}

/**
 * Player speed in world units, recovered without touching the demo.
 *
 * The camera follows the player, so the player is drawn at a fixed screen
 * position and its own sprite says nothing about movement. While the hazard
 * grace window is up the hazards are frozen in the world, so their *screen*
 * movement is exactly the camera's — the player's movement, negated. Dividing
 * by the frame time gives the same px/s the game uses internally.
 */
function playerSpeeds(recording) {
  const values = [];
  for (let index = 1; index < recording.length; index += 1) {
    const previous = recording[index - 1];
    const current = recording[index];
    if (!previous.ready || !current.ready) continue;
    if (previous.hazards.length !== 3 || current.hazards.length !== 3) continue;
    const dt = (current.at - previous.at) / 1000;
    if (dt <= 0.001 || dt > 0.1) continue;
    values.push(
      Math.hypot(
        current.hazards[0].x - previous.hazards[0].x,
        current.hazards[0].y - previous.hazards[0].y,
      ) / dt,
    );
  }
  return values;
}

const median = (values) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

async function runDesktop(browser, baseUrl, errors) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(PROBE);
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

  await page.goto(`${baseUrl}/`, { waitUntil: "load" });
  const booted = await waitForText(page, "Pickup", 15000);
  const canvasSize = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    return canvas ? { width: canvas.width, height: canvas.height } : null;
  });
  check(booted, "boot: title screen renders");
  check(
    canvasSize?.width === 1280 && canvasSize?.height === 800,
    "boot: canvas matches the viewport",
    `${canvasSize?.width}x${canvasSize?.height}`,
  );

  await hold(page, "Space", 160);
  check(await waitForText(page, "Lives: 3", 10000), "start: Space begins the round");

  // ---- grace: hazards must hold still while READY is up --------------------
  await page.waitForTimeout(900);
  const grace = (await frames(page)).filter(
    (frame) => frame.ready && frame.hazards.length === 3,
  );
  const graceTimes = grace.map((frame) => frame.time).filter((value) => value !== null);
  check(grace.length > 20, "grace: frames observed while READY is shown", `${grace.length}`);
  check(
    positionSet(grace).size === 1,
    "grace: hazards hold still",
    `${positionSet(grace).size} distinct position set(s)`,
  );
  check(
    graceTimes.length > 0 &&
      Math.min(...graceTimes) >= ROUND_SECONDS - HAZARD_GRACE_SECONDS - 0.05,
    "grace: READY only inside the first 3 s",
    graceTimes.length > 0 ? `earliest ${Math.min(...graceTimes)} s left` : "no READY frame",
  );

  // ---- the same hazards move as soon as the window closes ------------------
  await waitForRoundTimeBelow(page, ROUND_SECONDS - HAZARD_GRACE_SECONDS - 0.4, 8000);
  await page.waitForTimeout(600);
  const afterGrace = (await frames(page)).filter(
    (frame) =>
      !frame.ready &&
      frame.time !== null &&
      frame.time < ROUND_SECONDS - HAZARD_GRACE_SECONDS - 0.2 &&
      frame.hazards.length === 3,
  );
  check(
    positionSet(afterGrace).size > 10,
    "grace: hazards move once the window ends",
    `${positionSet(afterGrace).size} positions`,
  );

  // ---- standing still costs a life -----------------------------------------
  let mark = await frameCount(page);
  await hold(page, "KeyR", 200);
  check(
    await waitForTextAfter(page, mark, "Lives: 3"),
    "damage: R restarts the round",
  );
  const damaged = await (async () => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const recording = await frames(page);
      if (recording.some((frame) => frame.lives !== null && frame.lives <= 2)) return true;
      await page.waitForTimeout(200);
    }
    return false;
  })();
  check(damaged, "damage: standing still costs a life");

  // ---- dash: the burst is measurably faster than walking -------------------
  mark = await frameCount(page);
  await hold(page, "KeyR", 200);
  check(
    await waitForTextAfter(page, mark, "Lives: 3"),
    "dash: the round restarts before the measurement",
  );
  await page.waitForTimeout(300);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(500);
  const shiftAt = await page.evaluate(() => performance.now());
  await page.keyboard.down("ShiftLeft");
  await page.waitForTimeout(220);
  await page.keyboard.up("ShiftLeft");
  await page.waitForTimeout(150);
  await page.keyboard.up("ArrowUp");

  const recorded = await frames(page);
  const walking = recorded.filter(
    (frame) => frame.ready && frame.at > shiftAt - 450 && frame.at < shiftAt - 50,
  );
  const dashing = recorded.filter(
    (frame) => frame.ready && frame.at >= shiftAt && frame.at <= shiftAt + 200,
  );
  const walkSpeed = median(playerSpeeds(walking));
  const dashSpeed = median(playerSpeeds(dashing));
  const ratio = walkSpeed > 0 ? dashSpeed / walkSpeed : 0;
  check(
    walkSpeed > 100 && ratio >= 1.6 && ratio <= 2.4,
    "dash: the Shift burst is about twice the walk speed",
    `walk ${walkSpeed.toFixed(0)} px/s (${walking.length} frames), burst ${dashSpeed.toFixed(0)} px/s (${dashing.length} frames), ratio ${ratio.toFixed(2)}`,
  );

  if (process.env.E2E_KEEP) {
    await page.screenshot({ path: join(ROOT, "e2e-desktop.png") });
  }
  await context.close();
}

async function runTouch(browser, baseUrl, errors) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  await context.addInitScript(PROBE);
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`touch console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`touch pageerror: ${error.message}`));

  await page.goto(`${baseUrl}/`, { waitUntil: "load" });
  const ready = await waitForText(page, "Tap — start", 15000);
  check(ready, "touch: the title offers a tap to start");

  const pointer = (type, x, y) =>
    page.evaluate(
      ([kind, clientX, clientY]) => {
        window.dispatchEvent(
          new PointerEvent(kind, {
            pointerId: 1,
            pointerType: "touch",
            isPrimary: true,
            bubbles: true,
            clientX,
            clientY,
          }),
        );
      },
      [type, x, y],
    );

  // Hold the tap for a few frames: the demo reads the pointer once per frame.
  await pointer("pointerdown", 195, 420);
  await page.waitForTimeout(250);
  await pointer("pointerup", 195, 420);
  const started = await waitForText(page, "Lives: 3", 10000);
  check(started, "touch: a tap starts the round");

  // d-pad: bottom-left, margin 104 from the corner, deadzone 14 (see main.ts).
  const padX = 104;
  const padY = 844 - 104;
  await pointer("pointerdown", padX - 40, padY);
  await page.waitForTimeout(600);
  await pointer("pointerup", padX - 40, padY);
  await page.waitForTimeout(120);

  const recorded = (await frames(page)).filter(
    (frame) => frame.hazards.length === 3 && frame.ready,
  );
  const middle = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  // Camera follows the player: a hazard that is frozen in the world slides to
  // the right on screen when the player walks left.
  const head = recorded.slice(0, 10).map((frame) => frame.hazards[0].x);
  const tail = recorded.slice(-10).map((frame) => frame.hazards[0].x);
  const movedLeft = head.length > 0 && tail.length > 0 ? middle(tail) - middle(head) : 0;
  check(
    movedLeft >= 20,
    "touch: the d-pad moves the player",
    `moved ${movedLeft.toFixed(1)} px left over ${recorded.length} frames`,
  );

  if (process.env.E2E_KEEP) {
    await page.screenshot({ path: join(ROOT, "e2e-touch.png") });
  }
  await context.close();
}

async function main() {
  if (!existsSync(join(DIST, "index.html"))) {
    throw new Error(`no built demo at ${DIST} — run \`pnpm -r build\` first`);
  }

  const server = await serveDist();
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const errors = [];
  const launch = {
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required",
      "--mute-audio",
    ],
  };

  const executablePath = process.env.E2E_CHROMIUM;
  const browser = executablePath
    ? await chromium.launch({ ...launch, executablePath })
    : await chromium.launch({ ...launch, channel: process.env.E2E_CHANNEL ?? "chrome" });

  try {
    await runDesktop(browser, baseUrl, errors);
    await runTouch(browser, baseUrl, errors);
  } finally {
    await browser.close();
    server.close();
  }

  check(errors.length === 0, "console: no errors", errors.slice(0, 3).join(" | "));

  if (failures.length > 0) {
    console.error(`e2e failed: ${failures.length} check(s)`);
    process.exitCode = 1;
  } else {
    console.log("e2e passed");
  }
}

main().catch((error) => {
  console.error(`e2e crashed: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
