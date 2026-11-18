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
 * R6 and R7 are not game checks but "what ships" checks, and they are here for
 * the same reason: a phone session found all three by hand. A `\uXXXX` that
 * survived to the browser, a favicon nobody linked (so the browser asks for
 * `/favicon.ico` and logs a 404), and a title screen that read "Tap — start"
 * while only the corner pad answered a tap. None of those are visible to the
 * state contract, which is exactly why they need a machine.
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

import { existsSync, readdirSync, readFileSync } from "node:fs";
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
    // On Actions this becomes an annotation on the check run, which is the only
    // way to read a failure from here: this container has no token for the job
    // log, so a failure that is only in the log is a failure nobody can see.
    console.error(`::error::${label}${detail ? ` — ${detail}` : ""}`);
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

/** The text the browser is actually handed: the built page and its bundles, never the sources. */
function builtArtifacts() {
  const files = [{ name: "index.html", text: readFileSync(join(DIST, "index.html"), "utf8") }];
  const assets = join(DIST, "assets");
  if (existsSync(assets)) {
    for (const entry of readdirSync(assets).sort()) {
      if (entry.endsWith(".js") || entry.endsWith(".css")) {
        files.push({ name: `assets/${entry}`, text: readFileSync(join(assets, entry), "utf8") });
      }
    }
  }
  return files;
}

const RAW_ESCAPE = /\\u[0-9a-fA-F]{4}/;

/**
 * R6: what ships, not what is typed.
 *
 * `\u2014` is a TypeScript escape — the compiler turns it into `—` and the bundle carries the
 * character, so the source may contain it and that is fine. `index.html` has no compiler: the
 * same six characters ship as text and the tab reads `Runner \u2014 Glyph Arena`. That went out
 * in #155 and only an eye caught it (#QA), which is exactly the class of defect this script
 * exists to take off the eye. So the rule is on the built files: a `\uXXXX` that survives into
 * the page or the bundle is a dash somebody meant, and it is red here.
 *
 * The favicon rides along because it is the same kind of invisible: a missing `<link rel="icon">`
 * makes the browser ask for `/favicon.ico`, which 404s and puts an error in the console a tester
 * has to notice by hand.
 */
function runArtifacts() {
  const files = builtArtifacts();
  const offenders = [];
  for (const file of files) {
    const match = file.text.match(RAW_ESCAPE);
    if (match) offenders.push(`${file.name}: ${match[0]}`);
  }
  check(
    offenders.length === 0,
    "R6: no \\uXXXX escape reached the browser as text",
    offenders.join("; ") || `${files.length} built file(s) clean`,
  );

  const html = files[0].text;
  check(
    html.includes('rel="icon"') && html.includes("favicon.svg"),
    "R6: the page links its favicon",
    'no <link rel="icon" href="...favicon.svg"> in the built page — the browser then asks for /favicon.ico and logs a 404',
  );
  check(
    existsSync(join(DIST, "favicon.svg")),
    "R6: the favicon is in the built site",
    "public/favicon.svg did not reach dist/",
  );
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

/**
 * Hold a key for a while. Reserved for presses whose *duration* is the point — the 97 px pit needs
 * the whole 460 ms of a variable jump. Anything that only asks "did the player press it" belongs in
 * `pressOnce`.
 */
async function pressAndRelease(page, keyName, ms) {
  await page.keyboard.down(keyName);
  await page.waitForTimeout(ms);
  await page.keyboard.up(keyName);
}

/**
 * One frame of key, then up — the shortest press a frame can see. `input` latches a press that lands
 * and lifts between two samples for exactly one frame, so a start or a restart does not need to be
 * held 160 ms for a frame to notice it.
 */
async function pressOnce(page, keyName) {
  await page.keyboard.down(keyName);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(true))));
  await page.keyboard.up(keyName);
}

/**
 * One frame of finger, then up — the shortest press the page can possibly see. This is what the
 * touch pad has to accept: if a tap has to be held for 150 ms to be noticed, every real tap that
 * lands and lifts between two frames is lost.
 */
async function oneFrameTap(page, x, y) {
  await pointer(page, "pointerdown", x, y);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(true))));
  await pointer(page, "pointerup", x, y);
}

/**
 * The levels, read from `level.ts` rather than typed into this file: the ASCII is the level, so a
 * test that hard-codes a column is a test that goes green when the level moves and the game does
 * not. `LEVEL_*` appear in the file in the same order as the `LEVELS` list they feed.
 */
function readLevels() {
  const text = source("level.ts") ?? "";
  const tile = Number(/export const TILE\s*=\s*(\d+)/.exec(text)?.[1] ?? Number.NaN);
  const grids = [...text.matchAll(/const (LEVEL_[A-Z_]+)\s*:[^=]*=\s*\[([\s\S]*?)\];/g)].map((match) => ({
    name: match[1],
    rows: [...match[2].matchAll(/"([^"]*)"/g)].map((row) => row[1]),
  }));
  return { tile, grids };
}

const BODY = { w: 20, h: 28 }; // createBody(x, y, 20, 28) in main.ts

const tileAt = (grid, column, row) => grid.rows[row]?.[column] ?? ".";

/** Mirrors `hazardWithin(x, y, w, h, margin)` in level.ts. */
function hazardWithin(grid, tile, x, y, margin = 0) {
  for (let row = Math.floor(y / tile); row <= Math.floor((y + BODY.h - 0.001) / tile); row += 1) {
    for (let column = Math.floor((x - margin) / tile); column <= Math.floor((x + BODY.w + margin - 0.001) / tile); column += 1) {
      if (tileAt(grid, column, row) === "^") return true;
    }
  }
  return false;
}

/** How much clear ground a spot has, in px — the same question the fix's rule asks. */
function clearPx(grid, tile, x, y) {
  let low = 0;
  let high = 512;
  if (!hazardWithin(grid, tile, x, y, high)) return high;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (hazardWithin(grid, tile, x, y, middle)) high = middle;
    else low = middle;
  }
  return low;
}

/** Are there spike tiles in the rows the body occupies, within `look` px of its right edge? */
function spikesAhead(grid, tile, edgeX, y, look, height = BODY.h) {
  const first = Math.floor(y / tile);
  const last = Math.floor((y + height - 0.001) / tile);
  for (let column = Math.floor(edgeX / tile); column <= Math.floor((edgeX + look) / tile); column += 1) {
    for (let row = first; row <= last; row += 1) {
      if (tileAt(grid, column, row) === "^") return true;
    }
  }
  return false;
}

/** Is there a hole in the floor within `look` px of the body's right edge? */
function pitAhead(grid, tile, edgeX, look) {
  const solid = (column) => {
    if (column >= (grid.rows[0]?.length ?? 0)) return true; // past the end is not a hole
    const bottom = tileAt(grid, column, grid.rows.length - 1);
    const above = tileAt(grid, column, grid.rows.length - 2);
    return "#=".includes(bottom) || "#=".includes(above);
  };
  for (let column = Math.floor(edgeX / tile); column <= Math.floor((edgeX + look) / tile); column += 1) {
    if (!solid(column)) return true;
  }
  return false;
}

/**
 * Hold right and get out of the way of the level: jump holes, jump the one-tile step the body
 * cannot walk up, and jump a walker about to be walked into. It is the vehicle for the assertions,
 * not one of them — it may die on the way; what it must not do is stop.
 */
async function walkRight(page, done, { levels, timeoutMs = 25000, jumpFor = true, jumpHazards = false } = {}) {
  const { tile, grids } = levels;
  const gridFor = (level) => grids[level - 1] ?? grids[0];
  const samples = [];
  const started = Date.now();
  let blocked = 0;
  await page.keyboard.down("ArrowRight");
  try {
    while (Date.now() - started < timeoutMs) {
      const current = await state(page);
      if (!current) {
        await page.waitForTimeout(40);
        continue;
      }
      samples.push(current);
      if (done(current)) return { hit: true, samples };
      if (current.phase === "dead") {
        blocked = 0;
        await page.waitForTimeout(120);
        continue;
      }
      if (current.phase !== "play") {
        await page.waitForTimeout(40);
        continue;
      }
      if (jumpFor && current.grounded) {
        const grid = gridFor(current.level);
        const edge = current.x + BODY.w;
        const enemy = (current.enemies ?? []).find((e) => e.x > edge && e.x - edge < 120);
        blocked = Math.abs(current.vx) < 5 ? blocked + 1 : 0;
        const hazardAhead = jumpHazards && spikesAhead(grid, tile, edge, current.y, 70);
        if (pitAhead(grid, tile, edge, 90) || blocked >= 3 || enemy || hazardAhead) {
          blocked = 0;
          await pressAndRelease(page, "Space", 460); // the 97 px pit needs the full hold
          continue;
        }
      }
      await page.waitForTimeout(45);
    }
    return { hit: false, samples };
  } finally {
    await page.keyboard.up("ArrowRight").catch(() => {});
  }
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
  await pressOnce(page, "Space");
  return (await until(page, (s) => s.phase === "play", { timeoutMs: 6000 })).hit;
}

/** Watch the jump while it happens: the frame after the press carries the speed. */
async function jumpProfile(page, { holdMs }) {
  // The baseline is the ground you left, read BEFORE the press. The first sample after
  // `keyboard.down` is already one frame into the jump — 12.7 px at 60 fps — and measuring the
  // peak up from there made this check fail by exactly one frame of latency: QA measured 104.8 px
  // in 9 of 10 runs and 93.1 px in the tenth, against a floor of 95. The floor sat one frame away
  // from the truth, so the baseline was the defect, not the jump.
  const ground = await state(page);
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
    // World y grows downward, so the peak is the smallest y, measured from the ground you left.
    peak: ground !== null && ys.length > 0 ? ground.y - Math.min(...ys) : Number.NaN,
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

  // R8's eye: every string the canvas draws, recorded from inside the renderer. The HUD lives on
  // a canvas, so `textContent` cannot see it and a source grep is wrong (a TS `"\u2014"` is a
  // correct escape that compiles to the character). Only what is actually painted can be wrong.
  await page.addInitScript(() => {
    const drawn = [];
    const proto = CanvasRenderingContext2D.prototype;
    for (const name of ["fillText", "strokeText"]) {
      const original = proto[name];
      proto[name] = function (text, ...rest) {
        if (typeof text === "string") drawn.push(text);
        return original.call(this, text, ...rest);
      };
    }
    Object.defineProperty(window, "__runnerDrawnText", { value: drawn });
  });

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "load" });

    // ---- R6: the title the tab shows, read from the running page ---------
    const documentTitle = await page.title();
    check(
      !documentTitle.includes("\\u"),
      "R6: the tab title carries no raw escape",
      documentTitle.includes("\\u") ? `document.title is ${JSON.stringify(documentTitle)}` : documentTitle,
    );
    check(
      documentTitle === "Runner — Glyph Arena",
      "R6: the tab title is the real dash",
      `${JSON.stringify(documentTitle)} — expected ${JSON.stringify("Runner — Glyph Arena")}`,
    );

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
      deathLog: "object",
      level: "number",
      levelCount: "number",
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
      check(
        shape.levelCount === 3 && shape.level === 1,
        "R0: the run starts on level 1 of 3 (a clear runs straight into the next level)",
        `level ${shape.level} / ${shape.levelCount}`,
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
      // Space both starts the run and jumps, and the body is created a hair above the
      // ground: both are airborne frames that say nothing about "the ground holds while you
      // run". Land first — with a bound, so a spawn that never settles still fails here
      // instead of being averaged away.
      //
      // Landing once is not enough: the start press is held for 160 ms and the jump buffer
      // remembers it for 0.12 s, so a *second* jump can fire a few frames after the landing and
      // land inside the measured second (that is the 88% run). Wait for the ground to still
      // hold after the buffer must have expired.
      let startSettled = { hit: false, samples: [] };
      for (let attempt = 0; attempt < 6 && !startSettled.hit; attempt += 1) {
        const landed = await until(page, (s) => s.grounded && s.vy === 0, { timeoutMs: 1500 });
        if (!landed.hit) break;
        await page.waitForTimeout(200);
        const after = await state(page);
        startSettled = { hit: after !== null && after.grounded && after.vy === 0, samples: landed.samples };
      }
      check(
        startSettled.hit,
        "R2: the start settles on the ground",
        startSettled.hit
          ? `grounded and still after ${startSettled.samples.length} sample(s)`
          : "never grounded within 1.5 s — the spawn or the landing is wrong",
      );
      // The ground is judged on every drawn frame, not on a poll. The old check sampled every
      // 40 ms and demanded 95% grounded: 24 samples leave room for exactly one bad sample, so a
      // single airborne frame failed it (CI: 88% of 24), and QA could not reproduce that on an
      // idle machine (10 of 10 runs were 100%). A ratio of samples is a weaker claim than "no
      // frame while running was airborne", and the frame log is what the game actually does.
      await page.evaluate(() => {
        const w = window;
        w.__groundFrames = [];
        w.__groundStop = false;
        const tick = () => {
          const s = w.__runnerState;
          if (s) w.__groundFrames.push({ grounded: s.grounded === true, deaths: s.deaths });
          if (!w.__groundStop) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const before = await state(page);
      await page.keyboard.down("ArrowRight");
      await page.waitForTimeout(1000);
      await page.keyboard.up("ArrowRight");
      const after = await state(page);
      const frames = await page.evaluate(() => {
        window.__groundStop = true;
        return window.__groundFrames;
      });
      const airborne = frames.filter((frame) => !frame.grounded);
      const dx = after.x - before.x;
      const cameraAdvance = after.cameraX - before.cameraX;
      check(
        frames.length >= 10 && frames.every((frame) => frame.deaths === 0),
        "R2: a second of running kills nobody",
        frames.length === 0 ? "no frames recorded (the page never drew) — not reported as 0 deaths" : `deaths 0 across ${frames.length} frames`,
      );
      check(
        frames.length >= 10 && airborne.length === 0,
        "R2: the ground holds under you while you run (every frame, not a sample)",
        `${airborne.length} airborne frame(s) of ${frames.length}` +
          (airborne.length === 0 ? "" : ` — first at frame ${frames.indexOf(airborne[0])}`),
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
      await page.bringToFront();
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
        const last = runUntilDeath.samples.at(-1);
        check(
          false,
          "R4: the pit is lethal",
          died
            ? "no grounded sample before the death"
            : `no death in 14s of running right (last: phase ${last?.phase}, x ${last?.x?.toFixed(0)}, ` +
              `vx ${last?.vx?.toFixed(0)}, grounded ${last?.grounded}, ${runUntilDeath.samples.length} samples)`,
        );
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
        // The first play frame after a respawn is still in the air: `respawn()`
        // builds the body at the safe spot and the next physics step is what
        // makes it grounded. Sampling that frame and calling it "not on ground"
        // is the check being early, not the game being wrong — wait for the
        // landing, and fail if it never lands.
        const landed = await until(page, (s) => s.phase === "play" && s.deaths > 0 && s.grounded, {
          timeoutMs: 900,
          poll: 20,
        });
        const settled = landed.samples.at(-1) ?? back;
        const verdict = judgeRespawn({ deathX: lastAlive.x, respawnX: settled.x, grounded: settled.grounded });
        check(
          verdict.ok,
          "R4: the respawn point obeys the rule for the way you died",
          verdict.ok
            ? `${verdict.kind} — ${lastAlive.x.toFixed(0)} → ${settled.x.toFixed(0)} px (${verdict.retreat.toFixed(0)})`
            : `${verdict.why}${landed.hit ? "" : " — it never landed within 900ms of the respawn"}`,
        );
        check(settled.deaths === 1, "R4: one death is counted once", `deaths ${settled.deaths}`);

        // The log is what turns "died three times" into "died here, like this": it is the
        // number the next level is designed from, so its shape is part of the contract.
        const log = settled.deathLog;
        const entry = Array.isArray(log) ? log.at(-1) : null;
        check(
          Array.isArray(log) && log.length === settled.deaths,
          "R4: every death is in the log",
          Array.isArray(log) ? `${log.length} entr(ies) for deaths ${settled.deaths}` : `deathLog is ${typeof log}`,
        );
        check(
          entry !== null && entry.cause === "pit" && entry.x >= lastAlive.x - 8 && entry.simMs > 0,
          "R4: the log says where and how",
          entry
            ? `x ${entry.x} / ${entry.cause} at ${entry.simMs}ms (last grounded at ${lastAlive.x.toFixed(0)})`
            : "no entry for the death",
        );
      }
    }

    // ---- R8: the strings the canvas paints, read from inside the renderer ----
    const drawnText = await page.evaluate(() => [...(window.__runnerDrawnText ?? [])]);
    const distinct = [...new Set(drawnText)];
    const escapedDrawn = distinct.filter((text) => /\\u[0-9a-fA-F]{4}/.test(text));
    // Observability is not a string count: the recorder has to have seen all three screens the
    // title sequence goes through, or the "no escape" line below would pass on an empty array.
    const painted = (needle) => distinct.some((text) => text.includes(needle));
    const screens = [
      ["title", painted("Runner")],
      ["hud", painted("deaths:")],
      ["death result", painted("/ pit") || painted("/ spike") || painted("/ enemy")],
    ];
    const missing = screens.filter(([, seen]) => !seen).map(([name]) => name);
    check(
      missing.length === 0,
      "R8: the canvas text is observable on every screen",
      missing.length === 0
        ? `${distinct.length} distinct string(s) over ${drawnText.length} draw call(s) — title, HUD, death`
        : `never saw: ${missing.join(", ")} (${distinct.length} distinct)`,
    );
    check(
      escapedDrawn.length === 0,
      "R8: no string the canvas draws carries a raw escape",
      escapedDrawn.slice(0, 3).join(" | ") || "title, HUD and death screen all clean",
    );

    // ---- R11: a respawn has to leave you room to move ---------------------
    // QA's P1, and the two reasons the first version of this check passed while the bug was still
    // live: it measured "nothing pressed for three seconds" (the repro is **holding right**), and
    // it would have measured real time (the 0.6 s death pause does not advance `simMs`, so a 17 ms
    // trap reads as 617 ms and sails past a 300 ms bar).
    //
    //   R11a  the contract's `safe` is not a hazard tile, and it has >= 96 px of clear ground.
    //         `safe` is the field; the distance is measured **here from the level grid**, because
    //         publishing it too would be the same fact twice — and one of the two would go green
    //         alone. (The unit test checks the same 96 px against the same grid rule.)
    //   R11b  holding right after a respawn never becomes a death loop: a second death is allowed,
    //         a 17 ms gap is not.
    const levels = readLevels();
    if (levels.grids.length < 2 || !Number.isFinite(levels.tile)) {
      pend("R11: a respawn leaves room to move", `cannot read the level grid from level.ts (${levels.grids.length} levels, tile ${levels.tile})`);
    } else {
      await page.goto(`${baseUrl}/`, { waitUntil: "load" });
      const startedR11 = await startPlaying(page);
      const entered = startedR11 ? await walkRight(page, (s) => s.level === 2, { levels, timeoutMs: 30000 }) : { hit: false, samples: [] };
      check(
        entered.hit,
        "R11: the harness reaches level 2",
        entered.hit
          ? `${entered.samples.length} samples, level ${entered.samples.at(-1)?.level}`
          : `never left level 1 in 30s (deaths ${entered.samples.at(-1)?.deaths}, x ${entered.samples.at(-1)?.x?.toFixed(0)})`,
      );

      if (entered.hit) {
        const hitSpike = await walkRight(page, (s) => s.deaths > 0, { levels, timeoutMs: 12000 });
        const dead = hitSpike.samples.find((s) => s.deaths > 0);
        check(
          hitSpike.hit && dead?.deathLog?.at(-1)?.cause === "spike",
          "R11: level 2's spikes kill",
          `deaths ${dead?.deaths}, cause ${dead?.deathLog?.at(-1)?.cause}`,
        );

        const landed = await until(page, (s) => s.phase === "play" && s.deaths > 0 && s.grounded, { timeoutMs: 3000, poll: 20 });
        const settled = landed.samples.at(-1);
        const safe = settled?.safe;
        const grid = levels.grids[(settled?.level ?? 2) - 1];
        const clear = safe === undefined ? Number.NaN : clearPx(grid, levels.tile, safe.x, safe.y);
        check(
          Number.isFinite(clear) && clear >= 96,
          "R11a: the respawn point has 96 px of clear ground",
          safe === undefined ? "no `safe` in __runnerState" : `safe (${safe.x.toFixed(1)}, ${safe.y.toFixed(1)}), clear ${clear}px`,
        );

        // The repro, unchanged: right, and nothing else.
        await page.keyboard.down("ArrowRight");
        const second = await until(page, (s) => s.deaths >= 2, { timeoutMs: 3000, poll: 20 });
        await page.waitForTimeout(400);
        await page.keyboard.up("ArrowRight");
        const log = (await state(page))?.deathLog ?? [];
        const gap = second.hit && log.length >= 2 ? log[1].simMs - log[0].simMs : Number.NaN;
        check(
          !second.hit || (Number.isFinite(gap) && gap >= 300),
          "R11b: holding right after a respawn never becomes a death loop",
          !second.hit
            ? "no second death in 3s of holding right — room to move"
            : `${gap}ms of simMs between the death that put you back and the next one (${log[0]?.cause} → ${log[1]?.cause})`,
        );
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
      // R7 (① on a phone): the whole title screen starts the run. QA measured the old
      // behaviour — the hint said "Tap — start", the middle of the screen did nothing, and
      // only the corner pad worked, so a first-time phone user was stuck on the first move.
      // One frame of finger, because `holdMs` is supposed to be what keeps the press alive.
      await oneFrameTap(page, viewport.width / 2, viewport.height / 2);
      const centred = await until(page, (s) => s.phase === "play", { timeoutMs: 4000 });
      check(
        centred.hit,
        "R7 (①): a one-frame tap in the middle of the title screen starts the run",
        `phase ${centred.samples.at(-1)?.phase}`,
      );
      // Back to the title so the pad-start check below still proves the pad, not this tap.
      await pressOnce(page, "KeyR");
      await until(page, (s) => s.phase === "title", { timeoutMs: 2000 });
      await oneFrameTap(page, pads.jump.x, pads.jump.y);
    } else {
      check(true, "R7 (①): a one-frame tap in the middle of the title screen starts the run", "the page was already playing");
    }
    const started = await until(page, (s) => s.phase === "play", { timeoutMs: 6000 });
    check(started.hit, "R5 (③): the pad starts the run", `phase ${started.samples.at(-1)?.phase}`);

    const read = async (label, type) => {
      await pointer(page, "pointerdown", pads[label].x, pads[label].y);
      const samples = await sample(page, 260, 20);
      await pointer(page, "pointerup", pads[label].x, pads[label].y);
      await page.waitForTimeout(60);
      const vx = samples.length > 0 ? samples[samples.length - 1].vx : Number.NaN;
      const minVy = samples.length > 0 ? Math.min(...samples.map((s) => s.vy)) : Number.NaN;
      return { vx, minVy, samples: samples.length, type };
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

    // The press that used to need a 150 ms hold: one frame of pointer, then up. Without the pad's
    // hold the release between frames would erase the press before the loop ever sampled it, which
    // is why every touch procedure in this file used to sleep 150 ms before lifting.
    await until(page, (s) => s.grounded && s.phase === "play", { timeoutMs: 3000 });
    await oneFrameTap(page, pads.jump.x, pads.jump.y);
    const tapSamples = await sample(page, 140, 16);
    const tapMinVy = tapSamples.length > 0 ? Math.min(...tapSamples.map((s) => s.vy)) : Number.NaN;
    check(
      tapMinVy <= -600,
      "R5 (③): a one-frame tap on the jump pad still jumps (no 150 ms hold)",
      `minVy ${tapMinVy.toFixed(0)} px/s over ${tapSamples.length} samples`,
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
      "R6: no escape sequence and a linked favicon reach the browser",
      "R8: no string the canvas paints carries a raw escape",
      "R7 (①): a tap in the middle of the title screen starts the run",
    ];
    for (const label of labels) pend(label, `no built runner at ${DIST}`);
    console.log(`runner: not built yet — ${pending.length} check(s) pending, 0 run, 0 failed`);
    console.log("e2e (runner): pending is not a pass; these run the moment examples/runner/dist exists");
    return;
  }

  // Static first: the built files are checked before a browser is opened, so a shipping
  // mistake fails in a second and not after two browser passes.
  runArtifacts();

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
  const message = `e2e (runner) crashed: ${error.stack ?? error.message}`;
  console.error(message);
  console.error(`::error::${message.split("\n")[0]}`);
  process.exitCode = 1;
});
