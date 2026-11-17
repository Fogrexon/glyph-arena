#!/usr/bin/env node
/**
 * The runner slice's acceptance, in a real browser (CI step 9).
 *
 * QA judges the slice on three things — ①you do not die the moment you start
 * running, ②death puts you back where you can stand within 0.6 s, ③the two
 * touch pads and the jump pad do what the keyboard does. Those three are the
 * ones a browser can settle and a unit test cannot, so they live here, on the
 * contract `window.__runnerState` that the demo publishes from its first
 * commit.
 *
 * Everything this script asserts is read from that contract, never from the
 * pixels and never from a stopwatch, except the two wall-clock numbers it
 * *reports* next to the game's own (the verdict uses the game's).
 *
 * Deliberate non-goals:
 *
 * - J1–J4 (760 / 2600 / 0.09 / 0.12) are unit-test territory: they are
 *   per-frame numbers and a browser adds jitter to every one of them. Here we
 *   assert only that the shipped constants still *equal* the spec, which is the
 *   thing that drifts silently, and then confirm the wiring in the airspeed.
 * - Hitting the walker is not provoked. Provoking it needs a timed jump over a
 *   gap the script cannot see; the pit death gives the same respawn rule and QA
 *   takes the walker on a real device. `judgeRespawn` still encodes both rules,
 *   because the day the script *does* meet the walker it must not accept a
 *   129 px retreat for a spike.
 *
 * Until `examples/runner/dist` exists (the slice lives on its own branch for
 * now) this prints PEND for each check and exits 0 — pending is not a pass and
 * is never counted as one: the summary line says how many are pending, and the
 * moment the build is there the same checks run for real.
 *
 * Usage: `pnpm e2e:runner` after `pnpm -r build`. `RUNNER_DIST=/path/to/dist`
 * points it at a build outside the checkout (how this was first measured);
 * `E2E_CHROMIUM=/path/to/chrome` picks the browser; `E2E_KEEP=1` keeps a
 * screenshot.
 */

import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve, sep } from "node:path";

import { chromium } from "playwright-core";

const HERE = import.meta.dirname ?? new URL(".", import.meta.url).pathname;
const ROOT = resolve(HERE, "..");
const RUNNER_SRC = join(ROOT, "examples", "runner", "src");
const DIST = process.env.RUNNER_DIST
  ? resolve(process.env.RUNNER_DIST)
  : join(ROOT, "examples", "runner", "dist");
const PORT = Number(process.env.RUNNER_PORT ?? 4319);

/**
 * The spec's numbers (設計, 20 s slice). Asserted, never relaxed here.
 *
 * The buffer is 0.12 and the coyote 0.09 on purpose: a buffer has to outlast
 * the coyote window or "pressed just before landing" is eaten by the gap
 * between the two, which is the single most common "it did not jump" report.
 * If either number moves, the spec moves first and this line follows — never
 * the other way round.
 */
const SPEC = { jumpSpeed: 760, gravity: 2600, coyote: 0.09, buffer: 0.12 };

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
]);

const failures = [];
const pending = [];

function check(ok, label, detail) {
  if (ok) {
    console.log(`ok   ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
    failures.push(label);
  }
}

function pend(label, detail) {
  console.log(`PEND ${label}${detail ? ` — ${detail}` : ""}`);
  pending.push(label);
}

function serveDist(dist, port) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    if (url.pathname === "/favicon.ico") {
      response.writeHead(204).end();
      return;
    }
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const path = resolve(dist, relative === "" ? "index.html" : relative);
    if (!path.startsWith(dist + sep) && path !== join(dist, "index.html")) {
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
    server.listen(port, "127.0.0.1", () => resolvePromise(server));
  });
}

function source(name) {
  const path = join(RUNNER_SRC, name);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** A number the demo declares, read the same way the parry e2e reads its wave table. */
function declared(file, pattern, fallbackName) {
  const text = source(file);
  if (text === null) return { value: null, why: `${file} not in this checkout` };
  const match = text.match(pattern);
  if (!match) return { value: null, why: `${fallbackName} not found in ${file}` };
  return { value: Number(match[1]), why: "" };
}

async function state(page) {
  return page.evaluate(() => window.__runnerState ?? null);
}

/**
 * The touch pads, in the demo's own units. The demo draws them every frame at
 * `inset`/`size`/`12 * scale` from the bottom corners of a canvas it sizes to
 * the window, and reads pointers back in canvas pixels — so with a viewport of
 * 390x844 the centre of each pad is these numbers. Same derivation the parry
 * e2e uses for its d-pad: if the layout moves, this has to move with it.
 */
function touchPads(viewport, constants) {
  const { logicalHeight, size, inset, gap } = constants;
  const s = viewport.height / logicalHeight;
  const length = size * s * 0.9;
  const margin = inset * s;
  const bottom = viewport.height - margin - length;
  const centre = (x) => ({ x: x + length / 2, y: bottom + length / 2 });
  return {
    left: centre(margin),
    right: centre(margin + length + gap * s),
    jump: centre(viewport.width - margin - length),
  };
}

function pointer(page, type, x, y) {
  return page.evaluate(
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
}

async function pressAndRelease(page, keyName, ms) {
  // The loop polls held keys once a frame, so a press+release inside one frame
  // is invisible: hold for a few.
  await page.keyboard.down(keyName);
  await page.waitForTimeout(ms);
  await page.keyboard.up(keyName);
}

/** Poll the contract until `predicate` holds, keeping every sample. */
async function until(page, predicate, { timeoutMs = 8000, poll = 30 } = {}) {
  const started = Date.now();
  const samples = [];
  while (Date.now() - started < timeoutMs) {
    const s = await state(page);
    if (s) samples.push(s);
    if (s && predicate(s, samples)) return { hit: true, samples };
    await page.waitForTimeout(poll);
  }
  return { hit: false, samples };
}

/** Read the contract repeatedly for a window — `until` returns on the first match, this does not. */
async function sample(page, ms, poll = 20) {
  const samples = [];
  const started = Date.now();
  while (Date.now() - started < ms) {
    const s = await state(page);
    if (s) samples.push(s);
    await page.waitForTimeout(poll);
  }
  return samples;
}

async function startPlaying(page) {
  const located = await until(page, (s) => s.phase === "play", { timeoutMs: 4000 });
  if (located.hit) return true;
  // Title: Space starts it, and the pads tap the same action.
  await pressAndRelease(page, "Space", 160);
  return (await until(page, (s) => s.phase === "play", { timeoutMs: 6000 })).hit;
}

/** Watch the jump while it happens: the frame after the press carries the speed. */
async function jumpProfile(page, { holdMs }) {
  await page.keyboard.down("Space");
  const samples = [];
  const started = Date.now();
  while (Date.now() - started < Math.max(holdMs, 260)) {
    const s = await state(page);
    if (s) {
      samples.push({ swoop: Date.now() - started, vy: s.vy, y: s.y, grounded: s.grounded });
      if (s.grounded && samples.length > 2 && Date.now() - started > 80) break;
    }
    if (Date.now() - started >= holdMs) await page.keyboard.up("Space");
    await page.waitForTimeout(8);
  }
  await page.keyboard.up("Space").catch(() => {});
  const vy = samples.map((sample) => sample.vy);
  const ys = samples.map((sample) => sample.y);
  return {
    minVy: vy.length > 0 ? Math.min(...vy) : Number.NaN,
    // World y grows downward, so the peak is the smallest y.
    peak: ys.length > 0 ? ys[0] - Math.min(...ys) : Number.NaN,
    samples: samples.length,
  };
}

/**
 * The respawn rule, with the two deaths kept apart (社長's correction):
 * a spike leaves you where you died (±8 px), a pit puts you back on the last
 * ground you stood on — which for the gap in this level is 129 px back, and
 * returning you into the hole would kill you again on the next frame.
 */
function judgeRespawn({ deathX, respawnX, grounded }) {
  const retreat = deathX - respawnX;
  if (!grounded) return { ok: false, why: `respawn point is not on ground (y grounded false)` };
  if (retreat < -8) return { ok: false, why: `respawned ${(-retreat).toFixed(0)}px past the death point` };
  if (Math.abs(retreat) <= 8) return { ok: true, kind: "in place", retreat };
  if (retreat >= 60) return { ok: true, kind: "pit retreat", retreat };
  return { ok: false, why: `retreat ${retreat.toFixed(0)}px is neither in place (±8) nor a pit retreat (≥60)` };
}

async function runDesktop(browser, baseUrl, errors) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`runner: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`runner: ${error.message}`));

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "load" });

    // ---- R0: the contract itself ---------------------------------------
    const first = await until(page, (s) => typeof s.phase === "string", { timeoutMs: 4000 });
    const shape = first.samples[0] ?? null;
    const required = {
      phase: "string",
      x: "number",
      y: "number",
      vx: "number",
      vy: "number",
      grounded: "boolean",
      deaths: "number",
      respawnInMs: "number",
      cameraX: "number",
      goalX: "number",
      worldWidth: "number",
      simMs: "number",
    };
    if (shape === null) {
      check(false, "R0: window.__runnerState is published", "no state after 4s — the contract is the whole point");
    } else {
      const wrong = Object.entries(required)
        .filter(([key, type]) => typeof shape[key] !== type)
        .map(([key, type]) => `${key} should be ${type}, is ${typeof shape[key]}`);
      check(wrong.length === 0, "R0: __runnerState carries the agreed fields", wrong.join("; ") || `${Object.keys(required).length} fields typed`);
      check(
        shape.worldWidth > 0 && shape.goalX > 0 && shape.goalX <= shape.worldWidth && shape.cameraX >= 0,
        "R0: the level is sane",
        `cameraX ${shape.cameraX}, goalX ${shape.goalX}, worldWidth ${shape.worldWidth}`,
      );
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      check(
        shape.worldWidth > viewportWidth,
        "R0: the world is wider than the window (there is something off-screen)",
        `worldWidth ${shape.worldWidth} vs window ${viewportWidth}`,
      );
    }

    // ---- the shipped constants still equal the spec ---------------------
    const constants = {
      jumpSpeed: declared("physics.ts", /export const JUMP_VELOCITY\s*=\s*(-?[\d.]+)/, "JUMP_VELOCITY"),
      gravity: declared("physics.ts", /export const GRAVITY\s*=\s*([\d.]+)/, "GRAVITY"),
      coyote: declared("physics.ts", /export const COYOTE_SECONDS\s*=\s*([\d.]+)/, "COYOTE_SECONDS"),
      buffer: declared("physics.ts", /export const JUMP_BUFFER_SECONDS\s*=\s*([\d.]+)/, "JUMP_BUFFER_SECONDS"),
    };
    // Explicit rather than clever: four named constants, four spec numbers.
    const drift = [
      ["jumpSpeed", Math.abs(constants.jumpSpeed.value ?? Number.NaN), SPEC.jumpSpeed],
      ["gravity", constants.gravity.value, SPEC.gravity],
      ["coyote", constants.coyote.value, SPEC.coyote],
      ["buffer", constants.buffer.value, SPEC.buffer],
    ].filter(([, actual, expected]) => actual !== null && actual !== expected);
    const unknown = Object.entries(constants).filter(([, read]) => read.value === null);
    if (unknown.length > 0) {
      pend("R1: shipped constants match the spec", unknown.map(([name, read]) => `${name}: ${read.why}`).join("; "));
    } else {
      check(
        drift.length === 0,
        "R1: shipped constants match the spec (760 / 2600 / 0.09 / 0.12)",
        drift.length === 0
          ? "all four"
          : drift.map(([name, actual, expected]) => `${name} ${actual} != ${expected}`).join("; ") +
            " — fix the code, or get the spec changed first: relaxing this line is not an option",
      );
    }

    // ---- R2 (①): one second of running --------------------------------
    if (!(await startPlaying(page))) {
      check(false, "R2: the slice starts", "phase never reached play");
    } else {
      const before = await state(page);
      const held = [];
      const watch = (async () => {
        const started = Date.now();
        while (Date.now() - started < 1000) {
          held.push(await state(page));
          await page.waitForTimeout(40);
        }
      })();
      await page.keyboard.down("ArrowRight");
      await watch;
      await page.keyboard.up("ArrowRight");
      const after = await state(page);
      const known = held.filter(Boolean);
      const groundedRatio = known.length === 0 ? 0 : known.filter((s) => s.grounded).length / known.length;
      const dx = after.x - before.x;
      const cameraAdvance = after.cameraX - before.cameraX;
      check(
        known.length > 10 && known.every((s) => s.deaths === 0),
        "R2: a second of running kills nobody",
        known.length === 0 ? "sample missing (no state during the second) — not reported as 0 deaths" : `deaths 0 across ${known.length} samples`,
      );
      check(
        groundedRatio >= 0.95,
        "R2: the ground holds under you while you run",
        `grounded in ${(groundedRatio * 100).toFixed(0)}% of ${known.length} samples`,
      );
      check(dx >= 120, "R2: the player actually moves", `dx ${dx.toFixed(0)}px in 1.00s`);
      check(
        cameraAdvance > 0,
        "R2: the camera follows into the world",
        `cameraX ${before.cameraX.toFixed(0)} → ${after.cameraX.toFixed(0)} (+${cameraAdvance.toFixed(0)}px)`,
      );

      // ---- R3: the jump, taken with the key still held ----------------
      const settled = await until(page, (s) => s.grounded && Math.abs(s.vx) < 5, { timeoutMs: 2000 });
      const heldJump = await jumpProfile(page, { holdMs: 260 });
      const gravity = (await state(page))?.gravity;
      check(
        heldJump.minVy <= -700,
        "R3: a held jump starts at the spec's 760 (read on the frame after the press)",
        `minVy ${heldJump.minVy.toFixed(0)} px/s over ${heldJump.samples} samples`,
      );
      check(
        heldJump.peak >= 95 && heldJump.peak <= 130,
        "R3: it rises the height 760 up against 2600 down predicts (111 px)",
        `peak ${heldJump.peak.toFixed(0)}px`,
      );
      check(gravity === SPEC.gravity, "R3: the state reports the gravity in use", `gravity ${gravity}`);

      // A tap must not report the full 760: that is variable jump working, and
      // measuring ③ with a tap is how the touch pads get blamed for it.
      await until(page, (s) => s.grounded, { timeoutMs: 3000 });
      await page.waitForTimeout(120);
      const tapped = await jumpProfile(page, { holdMs: 40 });
      // The first frame after a press is 760 whatever you do with the key
      // afterwards, so a tap is only visible in the height it reaches. This is
      // the trap that gets the touch pads blamed for a broken jump.
      check(
        tapped.peak < heldJump.peak * 0.6,
        "R3: a tap cuts the jump short (a short press is not evidence of a broken jump)",
        `tap rose ${tapped.peak.toFixed(0)}px vs held ${heldJump.peak.toFixed(0)}px ` +
          `(both start at ${heldJump.minVy.toFixed(0)} px/s — that is why the height decides)`,
      );
    }

    // ---- R4 (②): fall in the pit, come back standing -------------------
    await page.goto(`${baseUrl}/`, { waitUntil: "load" });
    if (!(await startPlaying(page))) {
      check(false, "R4: the run starts for the death check", "phase never reached play");
    } else {
      // Hold right and do not jump: the gap in the floor is the first thing
      // that can kill you, and running at it is what a player does.
      await page.keyboard.down("ArrowRight");
      const runUntilDeath = await until(
        page,
        (s) => s.deaths > 0 || s.phase === "dead",
        { timeoutMs: 14000, poll: 30 },
      );
      await page.keyboard.up("ArrowRight");
      const lastAlive = [...runUntilDeath.samples].reverse().find((s) => s.phase === "play" && s.grounded);
      const died = runUntilDeath.hit;
      const respawn = await until(page, (s) => s.phase === "play" && s.deaths > 0, { timeoutMs: 3000, poll: 20 });
      const back = respawn.samples[respawn.samples.length - 1];

      if (!died || !lastAlive) {
        check(false, "R4: the pit is lethal", died ? "no grounded sample before the death" : "no death in 14s of running right");
      } else if (!respawn.hit || !back) {
        check(false, "R4: the player comes back", `still ${runUntilDeath.samples.at(-1)?.phase} after 3s`);
      } else {
        // The demo's own countdown, not the wall clock: polling adds tens of ms.
        const countdown = Math.max(...runUntilDeath.samples.map((s) => s.respawnInMs));
        const wallClock = (respawn.samples.length + 1) * 20;
        check(
          countdown >= 550 && countdown <= 650,
          "R4: the respawn countdown is the spec's 0.6s",
          `__runnerState said ${countdown}ms (wall clock ${wallClock}ms, inside polling slop)`,
        );
        const verdict = judgeRespawn({ deathX: lastAlive.x, respawnX: back.x, grounded: back.grounded });
        check(
          verdict.ok,
          "R4: the respawn point obeys the rule for the way you died",
          verdict.ok
            ? `${verdict.kind} — ${lastAlive.x.toFixed(0)} → ${back.x.toFixed(0)} px (${verdict.retreat.toFixed(0)})`
            : verdict.why,
        );
        check(back.deaths === 1, "R4: one death is counted once", `deaths ${back.deaths}`);
      }
    }
    if (process.env.E2E_KEEP) await page.screenshot({ path: join(ROOT, "e2e-runner.png") });
  } finally {
    await context.close();
  }
}

async function runTouch(browser, baseUrl, errors) {
  const viewport = { width: 390, height: 844 };
  const constants = {
    logicalHeight: declared("main.ts", /const LOGICAL_HEIGHT\s*=\s*(\d+)/, "LOGICAL_HEIGHT"),
    size: declared("main.ts", /const TOUCH\s*=\s*\{\s*size:\s*([\d.]+)/, "TOUCH.size"),
    inset: declared("main.ts", /const TOUCH\s*=\s*\{[^}]*inset:\s*([\d.]+)/, "TOUCH.inset"),
    gap: declared("main.ts", /inset\s*\+\s*size\s*\+\s*([\d.]+)\s*\*\s*s/, "the pad gap"),
  };
  const missing = Object.entries(constants).filter(([, read]) => read.value === null);
  if (missing.length > 0) {
    pend(
      "R5 (③): touch pads match the keyboard",
      `cannot locate the pads — ${missing.map(([name, read]) => `${name}: ${read.why}`).join("; ")}`,
    );
    return;
  }

  const pads = touchPads(viewport, {
    logicalHeight: constants.logicalHeight.value,
    size: constants.size.value,
    inset: constants.inset.value,
    gap: constants.gap.value,
  });

  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`runner touch: ${error.message}`));

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "load" });
    const title = await until(page, (s) => typeof s.phase === "string", { timeoutMs: 4000 });
    if (!title.hit) {
      check(false, "R5 (③): the touch page publishes state", "no __runnerState after 4s");
      return;
    }
    if (title.samples[0].phase !== "play") {
      await pointer(page, "pointerdown", pads.jump.x, pads.jump.y);
      await page.waitForTimeout(180);
      await pointer(page, "pointerup", pads.jump.x, pads.jump.y);
    }
    const started = await until(page, (s) => s.phase === "play", { timeoutMs: 6000 });
    check(started.hit, "R5 (③): the pad starts the run", `phase ${started.samples.at(-1)?.phase}`);

    const read = async (label, type) => {
      await pointer(page, "pointerdown", pads[label].x, pads[label].y);
      const samples = await sample(page, 260, 20);
      await pointer(page, "pointerup", pads[label].x, pads[label].y);
      await page.waitForTimeout(60);
      const vx = samples.length > 0 ? samples[samples.length - 1].vx : Number.NaN;
      return { vx, minVy: Math.min(...samples.map((s) => s.vy)), samples: samples.length, type };
    };

    const settle = async () => page.waitForTimeout(220);
    await settle();
    const touchRight = await read("right", "touch");
    await settle();
    const touchLeft = await read("left", "touch");

    // The keyboard on the same page: ③ says "the same behaviour", so compare
    // against it rather than against a number typed into this file.
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(220);
    const keyboardRight = (await state(page))?.vx ?? Number.NaN;
    await page.keyboard.up("ArrowRight");
    await settle();

    check(
      touchRight.vx > 0 && touchLeft.vx < 0,
      "R5 (③): the two pads move you in the directions they draw",
      `right ${touchRight.vx.toFixed(0)} px/s, left ${touchLeft.vx.toFixed(0)} px/s`,
    );
    const ratio = Math.abs(touchRight.vx) / Math.abs(keyboardRight);
    check(
      ratio > 0.85 && ratio < 1.15,
      "R5 (③): the right pad moves you as fast as the keyboard does",
      `touch ${touchRight.vx.toFixed(0)} vs keys ${keyboardRight.toFixed(0)} px/s (${ratio.toFixed(2)}x)`,
    );
    await settle();
    const touchJump = await read("jump", "touch");
    check(
      touchJump.minVy <= -600,
      "R5 (③): the jump pad jumps",
      `minVy ${touchJump.minVy.toFixed(0)} px/s over ${touchJump.samples} samples`,
    );

    if (process.env.E2E_KEEP) await page.screenshot({ path: join(ROOT, "e2e-runner-touch.png") });
  } finally {
    await context.close();
  }
}

async function main() {
  if (!existsSync(join(DIST, "index.html"))) {
    const labels = [
      "R0: __runnerState carries the agreed fields",
      "R1: shipped constants match the spec (760 / 2600 / 0.09 / 0.12)",
      "R2 (①): a second of running kills nobody, the ground holds, the camera follows",
      "R3: the jump rises 111 px and a tap cuts it short",
      "R4 (②): death and the respawn rule",
      "R5 (③): touch pads match the keyboard",
    ];
    for (const label of labels) pend(label, `no built runner at ${DIST}`);
    console.log(`runner: not built yet — ${pending.length} check(s) pending, 0 run, 0 failed`);
    console.log("e2e (runner): pending is not a pass; these run the moment examples/runner/dist exists");
    return;
  }

  const server = await serveDist(DIST, PORT);
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const errors = [];
  const launch = {
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
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

  check(errors.length === 0, "R9: no page errors", errors.slice(0, 3).join(" | "));

  if (failures.length > 0) {
    console.error(`e2e (runner) failed: ${failures.length} check(s), ${pending.length} pending`);
    process.exitCode = 1;
  } else {
    console.log(`e2e (runner) passed${pending.length > 0 ? ` with ${pending.length} pending` : ""}`);
  }
}

main().catch((error) => {
  console.error(`e2e (runner) crashed: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
