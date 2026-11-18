#!/usr/bin/env node
/**
 * Run the umbrella `README.md`'s program in a real browser (CI step 11).
 *
 * That block is the first fifteen lines anyone sees on npm, and it is the one document that
 * **freezes inside the tarball until the next version** — so a block that does not run cannot be
 * fixed after it ships. `pnpm -r typecheck` and `pnpm -r build` compile it (the fixture extracts it
 * from the README first), and `check:readme-example` typechecks it against the emitted `dist`
 * declarations the tarball actually carries. This step covers what a compiler cannot: the page is
 * served and the canvas is read.
 *
 * In the block's own colours (`#0d1626` clear, `#f7b32b` rectangle, `#e8eaed` label):
 *
 *   R1 the canvas has a bitmap the size of the window
 *   R2 the frame painted: the clear colour and the rectangle
 *   R3 the label text was drawn
 *   R4 frames keep coming (requestAnimationFrame advances)
 *   R5 the rectangle moves — `x` is `40 + Math.sin(elapsed) * 60`, so a still rectangle means
 *      `elapsed` never advanced even though frames did
 *   R6 no console or page errors other than failed resource loads
 *   R7 nothing the page asked for was missing
 *
 * Usage: `pnpm e2e:readme` (needs `pnpm -r build`). `E2E_CHROMIUM=/path/to/chrome` overrides the
 * browser, exactly like `e2e:tutorial`.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { chromium } from "playwright-core";

import { requireFresh } from "./lib/build-stamp.mjs";
import { serveDist } from "./lib/static-server.mjs";

const HERE = import.meta.dirname ?? new URL(".", import.meta.url).pathname;
const ROOT = resolve(HERE, "..");
const DIST = join(ROOT, "fixtures", "readme", "dist");

// Extracted from the umbrella README at build time: same rule as the tutorial gate.
requireFresh("readme", ROOT, { dist: DIST, label: "e2e:readme" });
const PORT = Number(process.env.E2E_README_PORT ?? 4322);

const CLEAR = [13, 22, 38]; // "#0d1626"
const RECTANGLE = [247, 179, 43]; // "#f7b32b"
const LABEL = [232, 234, 237]; // "#e8eaed"

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
 * One read of the canvas: how much of each of the block's three colours is on it, and where the
 * rectangle's left edge is. Runs in the page because the pixels are there.
 */
const SAMPLE = `(() => {
  const canvas = document.querySelector("#game");
  if (!canvas) return { error: "no #game canvas" };
  const context = canvas.getContext("2d");
  if (!context) return { error: "no 2d context" };

  const { width, height } = canvas;
  const { data } = context.getImageData(0, 0, width, height);
  const counts = { clear: 0, rectangle: 0, label: 0 };
  let minX = width;
  let maxX = -1;

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];

    if (r === ${CLEAR[0]} && g === ${CLEAR[1]} && b === ${CLEAR[2]}) counts.clear += 1;
    else if (r === ${RECTANGLE[0]} && g === ${RECTANGLE[1]} && b === ${RECTANGLE[2]}) {
      counts.rectangle += 1;
      const pixel = (index / 4) % width;
      if (pixel < minX) minX = pixel;
      if (pixel > maxX) maxX = pixel;
    } else if (r === ${LABEL[0]} && g === ${LABEL[1]} && b === ${LABEL[2]}) counts.label += 1;
  }

  return {
    width,
    height,
    counts,
    rect: maxX >= 0 ? { minX, maxX } : null,
    frames: window.__frames?.() ?? null,
  };
})()`;

async function main() {
  if (!existsSync(join(DIST, "index.html"))) {
    throw new Error(`no built README fixture at ${DIST} — run \`pnpm -r build\` first`);
  }

  const { server, missing } = await serveDist({ root: DIST, port: PORT });
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const errors = [];
  const launch = { args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio"] };

  const executablePath = process.env.E2E_CHROMIUM;
  const browser = executablePath
    ? await chromium.launch({ ...launch, executablePath })
    : await chromium.launch({ ...launch, channel: process.env.E2E_CHANNEL ?? "chrome" });

  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    page.on("console", (message) => {
      // A 404 reads as "Failed to load resource" from the page and names no URL; R7 names the path.
      if (message.type() === "error" && !/Failed to load resource/.test(message.text())) {
        errors.push(`console: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

    await page.addInitScript(COUNT_FRAMES);
    await page.goto(baseUrl, { waitUntil: "load" });

    let first = null;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      first = await page.evaluate(SAMPLE);
      if (first.error === undefined && first.counts.rectangle > 0) break;
      await page.waitForTimeout(100);
    }

    if (first?.error !== undefined) throw new Error(first.error);

    check(first.width > 0 && first.height > 0, "R1: the canvas is the size of the window", `${first.width}×${first.height}`);
    check(
      first.counts.clear > 0 && first.counts.rectangle > 0,
      "R2: the frame painted (clear colour and the rectangle)",
      `clear ${first.counts.clear}px, rectangle ${first.counts.rectangle}px`,
    );
    check(first.counts.label > 0, "R3: the label was drawn", `label ${first.counts.label}px`);

    const before = await page.evaluate(SAMPLE);
    await page.waitForTimeout(400);
    const after = await page.evaluate(SAMPLE);
    check(
      before.frames !== null && after.frames - before.frames >= 4,
      "R4: frames keep coming",
      `${before.frames} → ${after.frames} rAF callbacks in 400 ms`,
    );

    // `x` is `40 + Math.sin(elapsed) * 60`; a rectangle that does not move while frames advance is
    // a loop whose `elapsed` is frozen — the reader sees a still image, not a running game.
    const moved = before.rect === null || after.rect === null ? 0 : Math.abs(after.rect.minX - before.rect.minX);
    check(moved >= 3, "R5: the rectangle moves as `elapsed` advances", `moved ${moved.toFixed(1)}px in 400 ms`);

    check(errors.length === 0, "R6: no console or page errors", errors.slice(0, 3).join(" | "));
    check(missing.length === 0, "R7: every asset the page asked for was served", missing.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
    server.close();
  }

  if (failures.length > 0) {
    console.error(`e2e:readme failed: ${failures.length} check(s)`);
    process.exitCode = 1;
  } else {
    console.log("e2e:readme passed");
  }
}

main().catch((error) => {
  console.error(`e2e:readme crashed: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
