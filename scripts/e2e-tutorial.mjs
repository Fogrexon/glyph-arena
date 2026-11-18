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
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve, sep } from "node:path";

import { chromium } from "playwright-core";

const HERE = import.meta.dirname ?? new URL(".", import.meta.url).pathname;
const ROOT = resolve(HERE, "..");
const DIST = join(ROOT, "fixtures", "tutorial", "dist");
const PORT = Number(process.env.E2E_TUTORIAL_PORT ?? 4321);

const CLEAR = [13, 22, 38]; // "#0d1626"
const SOLID = [42, 53, 80]; // "#2a3550"
const PLAYER = [247, 179, 43]; // "#f7b32b"

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

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

/**
 * Serve the built page, and keep the list of requests the server could not answer. The browser's
 * own console message for a 404 names no URL, so this list is the precise version of it — and it
 * catches a 500 too, which the tutorial's reader would see as a blank page.
 */
async function serveDist() {
  const root = resolve(DIST);
  const missing = [];

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");

    // The page has no favicon; the browser asks anyway. Answering it is not hiding a page asset.
    if (relative === "favicon.ico") {
      response.writeHead(204).end();
      return;
    }

    const path = resolve(root, relative === "" ? "index.html" : relative);

    if (path !== root && !path.startsWith(root + sep)) {
      missing.push(`403 ${url.pathname}`);
      response.writeHead(403).end("forbidden");
      return;
    }

    try {
      const body = await readFile(path);
      const type = MIME.get(path.slice(path.lastIndexOf("."))) ?? "application/octet-stream";
      response.writeHead(200, { "content-type": type, "cache-control": "no-store" }).end(body);
    } catch {
      missing.push(`404 ${url.pathname}`);
      response.writeHead(404).end("not found");
    }
  });

  const listening = await new Promise((resolvePromise) => {
    server.listen(PORT, "127.0.0.1", () => resolvePromise(server));
  });

  return { server: listening, missing };
}

async function main() {
  if (!existsSync(join(DIST, "index.html"))) {
    throw new Error(`no built tutorial at ${DIST} — run \`pnpm -r build\` first`);
  }

  const { server, missing } = await serveDist();
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
