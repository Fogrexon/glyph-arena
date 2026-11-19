#!/usr/bin/env node
/**
 * The pixel gate: the same input, frame by frame, must paint the same bytes.
 *
 * Every other browser gate here reads a contract (`window.__runnerState`) or a DOM property. None
 * of them reads the picture, and the change this gate exists for is a picture change that keeps
 * every number identical: moving a game from its own `Math.round(cameraX)` onto
 * `draw.setView({ round: true })`. Measured 2026-11-19, the first attempt at that migration moved
 * 172 pixels while `__runnerState` matched on all nine checkpoints.
 *
 * So the page does not own time here. `requestAnimationFrame`, `performance.now`, `Date.now`,
 * `Math.random` and `devicePixelRatio` are replaced before the bundle runs, the gate advances
 * frames itself, and input is applied at *frame numbers* rather than at wall-clock times. The hash
 * is over `getImageData`'s RGBA bytes — never the PNG, whose encoder is free to change between
 * releases.
 *
 * Two things this gate refuses to do:
 *
 * - **Compare across environments.** Pixels depend on the browser build and on the fonts; the
 *   runner draws its HUD in `system-ui`, which is a different file on Debian and on Ubuntu. A
 *   golden written under one Chrome and compared under another turns every red into "which of the
 *   two is the bug". The golden records its environment, and a run whose **major** version, font
 *   probe, platform or viewport differs fails *without comparing*, naming what differs and saying
 *   how to re-generate.
 * - **Write the golden by accident.** Only `--write` touches `fixtures/pixel/`, so a change to a
 *   scene shows up as a diff in the pull request instead of quietly becoming the new truth.
 *
 * A golden is worth nothing unless the scene steps on the change being made, so the gate also runs
 * the same input three times in one session and requires the three hashes to agree: if the picture
 * depended on the wall clock, that check fails first and the comparison is meaningless anyway.
 *
 * Usage:
 *   pnpm e2e:pixel                  # every scene, against fixtures/pixel/<scene>.json
 *   pnpm e2e:pixel --write          # replace the goldens with what this run measured
 *   pnpm e2e:pixel --scene runner-1 # one scene only (a red that names one cause)
 *   E2E_CHROMIUM=/usr/bin/chromium pnpm e2e:pixel     # a browser outside the packaged one
 *   E2E_CHANNEL=chrome pnpm e2e:pixel                 # CI: the runner's preinstalled Chrome
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { chromium } from "playwright-core";

import { requireFresh } from "./lib/build-stamp.mjs";
import { serveDist } from "./lib/static-server.mjs";

const HERE = import.meta.dirname ?? new URL(".", import.meta.url).pathname;
const ROOT = resolve(HERE, "..");
const GOLDEN_DIR = join(ROOT, "fixtures", "pixel");

/** Frames per second the harness advances. 60 is the rate the loop itself expects. */
const FRAME_MS = 1000 / 60;

/**
 * The run both runner scenes paint: the title screen's "Space — start" at frame 6, then right for
 * the rest of the scene with two jumps. Shared on purpose — the two scenes differ only in the
 * viewport, so a difference between them can only be the projection.
 */
const RUNNER_INPUTS = [
  { frame: 6, key: "Space", action: "down" },
  { frame: 9, key: "Space", action: "up" },
  { frame: 20, key: "ArrowRight", action: "down" },
  { frame: 70, key: "Space", action: "down" },
  { frame: 74, key: "Space", action: "up" },
  { frame: 120, key: "Space", action: "down" },
  { frame: 124, key: "Space", action: "up" },
];

/**
 * The scenes. Each one is a page, a viewport, a list of frame-numbered inputs and the frames to
 * hash.
 *
 * `kind` is the build stamp's name for the example (`runner`, not `runner-1`): the gate refuses to
 * read a `dist` older than its sources, and the stamp is written by the example's build.
 *
 * Start with one scene per example. Three samples from one runner scene costs 180 frames of work;
 * adding camp and march before this has gone red once would give one red that names three causes.
 *
 * **A second scene exists for the scale, not for the page.** 900x540 is exactly the runner's own
 * `LOGICAL_HEIGHT`, so `scale()` is 1 there — and at 1 the difference between `(column * TILE -
 * cameraX) * s` and a canvas transform of `s` is a multiplication by one, which no scene can see.
 * `runner-scale` paints the same run at a height that is not a multiple of 540, so the world lands
 * on fractional device pixels and the two ways of writing the projection stop agreeing. Without
 * it, a migration to `draw.setView` could be green while the code path that actually scales was
 * never drawn once.
 */
export const SCENES = {
  "runner-1": {
    kind: "runner",
    dist: "examples/runner/dist",
    viewport: { width: 900, height: 540 },
    deviceScaleFactor: 1,
    sampleFrames: [60, 120, 180],
    inputs: RUNNER_INPUTS,
  },
  /**
   * The same run at `700 / 540 = 1.296…`, a scale that is neither 1 nor a binary fraction: `s` is
   * inexact, so `(x - cameraX) * s` and `x * s - cameraX * s` round differently in the last bits,
   * and a tile edge that sat on a pixel centre lands on the other side of it. Nothing else about
   * the scene changes — same level, same inputs, same frames — so a difference here is the
   * projection and nothing else.
   */
  "runner-scale": {
    kind: "runner",
    dist: "examples/runner/dist",
    viewport: { width: 900, height: 700 },
    deviceScaleFactor: 1,
    sampleFrames: [60, 120, 180],
    inputs: RUNNER_INPUTS,
  },
};

/** The text the font probe measures. It is only there to tell two environments apart. */
const FONT_PROBE = "Hx0O@lgMN 0123";
const FONT = "22px system-ui, sans-serif";

export function goldenFileFor(sceneName) {
  return join(GOLDEN_DIR, `${sceneName}.json`);
}

/**
 * The environment a golden is valid for, as the file records it.
 *
 * `font` is a measured width, not a name: two machines can both say `system-ui` and resolve it to
 * different files, and the width is the cheapest thing that moves when they do.
 */
export function environmentOf({ chromium: chromiumVersion, platform, viewport, deviceScaleFactor, font }) {
  return { chromium: chromiumVersion, platform, viewport, deviceScaleFactor, font };
}

const majorOf = (version) => String(version ?? "").split(".")[0] ?? "";

/**
 * The environment as one line, for a failure that has to say *what* differs.
 *
 * The refusal prints this whole line rather than the one field that disagreed: a second difference
 * behind the first is otherwise invisible until the first is fixed, and that costs a round trip
 * through CI to discover.
 */
export function describeEnvironment(environment) {
  return `chromium ${environment.chromium} · ${environment.platform} · ${environment.viewport} · dpr ${environment.deviceScaleFactor} · font ${environment.font}`;
}

/**
 * Why this run must not be compared with the golden at all, or `null` when it can be.
 *
 * A different Chromium **major** is the case the design names: the same pixels are not promised
 * across versions, so a comparison would produce a red that means "the browser changed" while
 * looking exactly like "the code changed". The font probe is the same argument one level down.
 */
export function environmentProblem(golden, environment) {
  if (majorOf(golden.chromium) !== majorOf(environment.chromium)) {
    return `golden was written by chromium ${golden.chromium}; this run is chromium ${environment.chromium} — different major versions do not promise the same pixels`;
  }
  if (golden.platform !== environment.platform) {
    return `golden was written on ${golden.platform}; this run is ${environment.platform}`;
  }
  if (golden.viewport !== environment.viewport) {
    return `golden was written at viewport ${golden.viewport}; this run is ${environment.viewport}`;
  }
  if (golden.deviceScaleFactor !== environment.deviceScaleFactor) {
    return `golden was written at deviceScaleFactor ${golden.deviceScaleFactor}; this run is ${environment.deviceScaleFactor}`;
  }
  if (Math.abs(Number(golden.font) - Number(environment.font)) > 1e-6) {
    return `the font probe measures ${environment.font} here and ${golden.font} in the golden — the environment resolves the same font differently`;
  }
  return null;
}

/** Every frame whose picture disagrees with the golden, with both sides named. */
export function compareSamples(golden, samples) {
  const mismatches = [];

  for (const sample of samples) {
    const expected = golden.samples.find((each) => each.frame === sample.frame);
    if (expected === undefined) {
      mismatches.push({ frame: sample.frame, expected: null, measured: sample.sha256 });
    } else if (expected.sha256 !== sample.sha256) {
      mismatches.push({ frame: sample.frame, expected: expected.sha256, measured: sample.sha256 });
    }
  }

  for (const expected of golden.samples) {
    if (!samples.some((each) => each.frame === expected.frame)) {
      mismatches.push({ frame: expected.frame, expected: expected.sha256, measured: null });
    }
  }

  return mismatches;
}

/** One line that says which scene, which frame, and both hashes — the red has to be readable. */
export function formatMismatch(sceneName, mismatch) {
  const side = (hash) => (hash === null ? "(not sampled)" : hash.slice(0, 16));

  return `FAIL ${sceneName} frame ${mismatch.frame}: golden ${side(mismatch.expected)} ≠ measured ${side(mismatch.measured)}`;
}

/**
 * Everything the page must not decide for itself, installed before the bundle runs.
 *
 * The pump is the whole trick: the loop asks for the next frame, the queue holds the callback, and
 * `__pump(n)` runs frames one at a time with a fixed step. Nothing here waits for a clock, so the
 * same 180 frames take the same picture on a fast machine and a slow one.
 */
function installDeterminism({ font, probe }) {
  const queue = [];
  let frame = 0;
  let handle = 0;
  const now = () => frame * (1000 / 60);

  window.requestAnimationFrame = (callback) => {
    queue.push(callback);
    handle += 1;
    return handle;
  };
  window.cancelAnimationFrame = () => {};

  Object.defineProperty(window.performance, "now", { configurable: true, value: now });
  Date.now = () => 1700000000000 + now();
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: () => 1 });

  // xorshift32, seeded: a game that rolls a die still gets the same die every run.
  let seed = 0x9e3779b9;
  Math.random = () => {
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed / 0x100000000;
  };

  window.__pump = (target) => {
    while (frame < target) {
      const due = queue.splice(0, queue.length);
      frame += 1;
      for (const callback of due) callback(now());
    }
    return frame;
  };

  window.__fontProbe = () => {
    const context = document.createElement("canvas").getContext("2d");
    context.font = font;
    return context.measureText(probe).width;
  };

  window.__sample = async () => {
    const canvas = document.querySelector("canvas");
    const context = canvas.getContext("2d");
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(data.buffer));

    return {
      sha256: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
      width: canvas.width,
      height: canvas.height,
    };
  };
}

function launchOptions() {
  return {
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  };
}

/**
 * One run of a scene: load, pump to each frame in order, apply the inputs due at that frame, and
 * take the samples on the way. Returns the samples and the environment this page measured.
 */
async function runScene(browser, scene, url) {
  const page = await browser.newPage({
    viewport: scene.viewport,
    deviceScaleFactor: scene.deviceScaleFactor,
  });

  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.addInitScript(installDeterminism, { font: FONT, probe: FONT_PROBE });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForSelector("canvas");

  const events = [...scene.inputs].sort((left, right) => left.frame - right.frame);
  const stops = [...new Set([...events.map((event) => event.frame), ...scene.sampleFrames])].sort(
    (left, right) => left - right,
  );

  const samples = [];
  for (const stop of stops) {
    for (const event of events.filter((each) => each.frame === stop)) {
      if (event.action === "down") await page.keyboard.down(event.key);
      else await page.keyboard.up(event.key);
    }

    await page.evaluate((target) => window.__pump(target), stop);

    if (scene.sampleFrames.includes(stop)) {
      const sample = await page.evaluate(() => window.__sample());
      samples.push({ frame: stop, sha256: sample.sha256, width: sample.width, height: sample.height });
    }
  }

  const font = await page.evaluate(() => window.__fontProbe());
  const environment = environmentOf({
    chromium: browser.version(),
    platform: process.platform,
    viewport: `${scene.viewport.width}x${scene.viewport.height}`,
    deviceScaleFactor: scene.deviceScaleFactor,
    font,
  });

  await page.close();
  return { samples, environment, errors };
}

const readFlag = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

/**
 * One scene, from the build stamp to the verdict. `true` means the scene painted what the golden
 * says it paints.
 *
 * The server is opened per scene rather than per file: a scene may point at its own `dist`, and a
 * gate that quietly served the wrong build would report the picture of a page nobody asked about.
 */
async function checkScene(browser, sceneName, scene, { write, port }) {
  const dist = join(ROOT, scene.dist);
  if (!existsSync(dist)) {
    console.error(`FAIL ${sceneName}: no build at ${scene.dist} — run \`pnpm -r build\` first`);
    return false;
  }
  requireFresh(scene.kind, ROOT, { dist, label: `e2e:pixel ${sceneName}` });

  const { server, missing } = await serveDist({ root: dist, port });

  try {
    const runs = [];
    for (let index = 0; index < 3; index += 1) {
      runs.push(await runScene(browser, scene, `http://127.0.0.1:${port}/`));
    }

    for (const run of runs) {
      if (run.errors.length > 0) {
        console.error(`FAIL ${sceneName}: the page threw — ${run.errors[0]}`);
        return false;
      }
    }

    // PH1 — the same input three times must be the same picture. This is checked before the golden
    // on purpose: a scene that reads the wall clock fails here, and a comparison against it would
    // have been meaningless.
    const [first, ...rest] = runs;
    for (const [index, run] of rest.entries()) {
      for (const sample of run.samples) {
        const reference = first.samples.find((each) => each.frame === sample.frame);
        if (reference?.sha256 !== sample.sha256) {
          console.error(
            `FAIL ${sceneName} frame ${sample.frame}: run ${index + 2} measured ${sample.sha256.slice(0, 16)} but run 1 measured ${String(reference?.sha256).slice(0, 16)} — the scene is not deterministic`,
          );
          return false;
        }
      }
    }
    console.log(`PASS ${sceneName} determinism: 3 runs, ${first.samples.length} frame(s) each, same hashes`);

    if (missing.length > 0) {
      console.error(`FAIL ${sceneName}: the page asked for ${missing.length} file(s) that were not there — ${missing.join(", ")}`);
      return false;
    }

    const goldenFile = goldenFileFor(sceneName);
    const golden = write || !existsSync(goldenFile) ? null : JSON.parse(readFileSync(goldenFile, "utf8"));

    if (write) {
      const document = {
        scene: sceneName,
        environment: first.environment,
        sampleFrames: scene.sampleFrames,
        samples: first.samples.map(({ frame, sha256 }) => ({ frame, sha256 })),
      };
      mkdirSync(dirname(goldenFile), { recursive: true });
      writeFileSync(goldenFile, `${JSON.stringify(document, null, 2)}\n`);
      console.log(`wrote ${goldenFile.replace(`${ROOT}/`, "")} — ${first.samples.length} sample(s) from chromium ${first.environment.chromium}`);
      return true;
    }

    if (golden === null) {
      console.error(`FAIL ${sceneName}: no golden at ${goldenFile.replace(`${ROOT}/`, "")} — write one with \`pnpm e2e:pixel --write\``);
      console.error(`     this run is ${describeEnvironment(first.environment)}`);
      console.error("     and it measured:");
      for (const sample of first.samples) console.error(`     frame ${sample.frame}: ${sample.sha256}`);
      return false;
    }

    // PH3 — refuse to compare across environments, and say which side is which.
    const problem = environmentProblem(golden.environment, first.environment);
    if (problem !== null) {
      console.error(`FAIL ${sceneName}: not compared — ${problem}`);
      console.error(`     re-generate in this environment with \`pnpm e2e:pixel --write\` (the diff shows the new numbers)`);
      console.error(`     this run is ${describeEnvironment(first.environment)}`);
      console.error("     and it measured:");
      for (const sample of first.samples) console.error(`     frame ${sample.frame}: ${sample.sha256}`);
      return false;
    }

    // PH2 — the one thing the gate is for.
    const mismatches = compareSamples(golden, first.samples);
    if (mismatches.length > 0) {
      for (const mismatch of mismatches) console.error(formatMismatch(sceneName, mismatch));
      console.error(`e2e:pixel: ${mismatches.length} of ${first.samples.length} frame(s) changed`);
      return false;
    }

    console.log(
      `PASS ${sceneName}: ${first.samples.length} frame(s) match the golden (chromium ${first.environment.chromium}, ${first.environment.viewport})`,
    );
    return true;
  } finally {
    server.close();
  }
}

/**
 * The scenes to run, derived from `SCENES` rather than listed here.
 *
 * `undefined` means "all of them", which is what CI asks for by passing no flag.
 */
export function sceneNamesFor(requested) {
  return requested === undefined ? Object.keys(SCENES) : [requested];
}

/**
 * Every scene, in the order they are declared, unless `--scene` names one.
 *
 * The default is derived from `SCENES` rather than written out: the day a scene is added, the run
 * CI performs covers it without anyone remembering to edit a list here — a gate that has to be told
 * about new scenes goes green on a scene nobody runs.
 */
async function main() {
  const write = process.argv.includes("--write");
  const sceneNames = sceneNamesFor(readFlag("--scene"));
  const unknown = sceneNames.filter((name) => SCENES[name] === undefined);

  if (unknown.length > 0) {
    console.error(`FAIL unknown scene ${unknown.join(", ")} — scenes: ${Object.keys(SCENES).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const executablePath = process.env.E2E_CHROMIUM;
  const browser = executablePath
    ? await chromium.launch({ ...launchOptions(), executablePath })
    : await chromium.launch({ ...launchOptions(), channel: process.env.E2E_CHANNEL ?? "chrome" });

  try {
    const basePort = Number(process.env.PIXEL_PORT ?? 4327);
    for (const [index, sceneName] of sceneNames.entries()) {
      // A port per scene: closing and reopening the same one between scenes invites a bind that
      // fails for a reason that has nothing to do with the picture.
      const ok = await checkScene(browser, sceneName, SCENES[sceneName], { write, port: basePort + index });
      if (!ok) {
        process.exitCode = 1;
        return;
      }
    }
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

export { FONT, FONT_PROBE, FRAME_MS };
