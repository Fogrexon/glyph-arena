#!/usr/bin/env node
/**
 * The acceptance harness for the slices: a machine that plays them, so a number is a rerun and
 * not a rewrite.
 *
 * Two lessons are baked in here, both learned the expensive way on 11-17.
 *
 * 1. **Take-off points are derived, never written down.** A hand-kept list of "jump at 246-276"
 *    went stale when the level moved and produced 95 deaths that looked exactly like a broken
 *    build. Everything here is read from the level data the game itself uses.
 * 2. **The bundle name comes from the page that is being played.** Reading it from a local build,
 *    or from a different page load, reports a bundle that is not on screen.
 *
 * Usage:
 *   node scripts/play-bot.mjs camp bold   [--runs 2] [--json]
 *   node scripts/play-bot.mjs camp careful [--runs 2] [--json]
 *   node scripts/play-bot.mjs runner      [--runs 1] [--json]
 *
 * Needs a built slice (`pnpm -r build`). `E2E_CHROMIUM=/path/to/chrome` picks the browser, the
 * same variable the e2e scripts read. Exit code is 0 only when every run met its expectation:
 * a cleared camp, or `goal` at the last runner level.
 */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve, sep } from "node:path";

import { chromium } from "playwright-core";

const HERE = import.meta.dirname ?? new URL(".", import.meta.url).pathname;
const ROOT = resolve(HERE, "..");

const MIME = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

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
      const type = MIME[path.slice(path.lastIndexOf("."))] ?? "application/octet-stream";
      response.writeHead(200, { "content-type": type, "cache-control": "no-store" }).end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  return new Promise((done) => server.listen(port, "127.0.0.1", () => done(server)));
}

/** The bundle the page is running, read from the page itself. */
async function bundleOf(page) {
  const ident = await page.evaluate(() => ({
    scripts: [...document.querySelectorAll("script[src]")].map((element) => element.src),
    title: document.title,
  }));
  return { bundle: ident.scripts.map((src) => String(src).split("/").pop()).join(" "), title: ident.title };
}

async function launch() {
  const executablePath = process.env.E2E_CHROMIUM;
  return executablePath ? chromium.launch({ executablePath, args: ["--no-sandbox"] }) : chromium.launch();
}

/* -------------------------------------------------------------------------------------------- *
 * Camp: bold mashes, careful waits for the tell and hits only in the rest.                      *
 * -------------------------------------------------------------------------------------------- */

async function playCamp(page, strategy) {
  // The driver runs inside the page, one decision per animation frame. Reading the state from the
  // harness costs 10-30 ms a sample, which is a third of a 260 ms tell: a bot that reacts three
  // frames late loses fights a human wins, and then the measurement blames the game.
  return page.evaluate(
    (mode) =>
      new Promise((resolve) => {
        const held = new Set();
        const key = (code, down) => {
          if (down && !held.has(code)) {
            held.add(code);
            window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true }));
          } else if (!down && held.has(code)) {
            held.delete(code);
            window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true }));
          }
        };

        // Four numbers, each read off the fight rather than tuned here: the blade reaches 30 px past
        // the shoulder (26 leaves room to arrive), the wait line sits outside the range a lunge can
        // start from, the tell has to be spent backing off until the commit ends without contact,
        // and the retreat has to stop before the commit does — see the lunge branch.
        const WAIT_GAP = 100;
        const HIT_GAP = 26;
        const TELL_GAP = 120;
        const LUNGE_GAP = 45;
        // Measured arrival is frame 15-16 of the 27-frame rest (the reversal out of the retreat costs
        // the first 250 ms), and a swing needs 4 frames to land. Pressing by frame 18 leaves the
        // swing ending 6 frames into the tell, which the retreat still covers.
        const REST_SWING_FRAMES = 18;
        const LUNGE_RUN_FRAMES = 10;

        let presses = 0;
        let tells = 0;
        let lunges = 0;
        let lastPress = -999;
        // Read, not written: the game's own starting health, or the first hit is not a change.
        let lastHearts = Number.POSITIVE_INFINITY;
        let frame = 0;
        const lost = [];
        const arrivals = [];
        const lastMode = new Map();
        const restStart = new Map();
        // A run is more than one fight now, so the totals are not enough: "the second camp is a
        // different fight" is a claim about the second camp, and a summed number cannot answer it.
        // Camps are derived from the spawn layout (split at the walk, not at a written-down index),
        // so moving an enemy does not silently re-label the fight.
        const campOf = new Map();
        const camps = new Map();
        const hpSeen = new Map();
        const deadSeen = new Set();
        let campsBuilt = false;
        const stat = (camp) => {
          let entry = camps.get(camp);
          if (entry === undefined) {
            entry = { camp, tells: 0, lunges: 0, hits: 0, heartsLost: 0, clearedAtMs: null };
            camps.set(camp, entry);
          }
          return entry;
        };
        let lungeAge = -1;
        let wasLunging = false;
        let arrived = false;

        const finish = () => {
          for (const code of [...held]) key(code, false);
          const s = window.__campState;
          resolve({
            phase: s.phase, hearts: s.hearts, hits: s.hits, kills: s.kills, simMs: s.simMs,
            presses, tells, lunges, arrivals, lost,
            camps: [...camps.values()].sort((a, b) => a.camp - b.camp),
          });
        };

        const tick = () => {
          const s = window.__campState;
          if (!s) return requestAnimationFrame(tick);
          frame += 1;
          if (s.phase !== "play") return finish();
          // A run that never ends is a measurement that lies: stop it and say so.
          if (s.simMs > 60000) return finish();
          if (s.hearts < lastHearts) {
            // A hit is only useful as a number if it says what the bot was doing: locked in its own
            // swing, in the air, or free and simply in the wrong place.
            const all = s.enemies
              .filter((enemy) => enemy.alive)
              .map((enemy) => ({ mode: enemy.mode, gap: Math.round(Math.abs(enemy.x + 10 - (s.x + 10)) - 20) }))
              .sort((a, b) => a.gap - b.gap);
            const blame = s.enemies
              .map((enemy, index) => ({ index, gap: Math.abs(enemy.x + 10 - (s.x + 10)) }))
              .sort((a, b) => a.gap - b.gap)[0];
            const blameCamp = blame === undefined ? undefined : campOf.get(blame.index);
            if (blameCamp !== undefined) stat(blameCamp).heartsLost += lastHearts - s.hearts;
            lost.push({ hearts: s.hearts, simMs: s.simMs, blade: s.blade, grounded: s.grounded, since: frame - lastPress, all });
            lastHearts = s.hearts;
          }
          if (!campsBuilt && s.enemies.length > 0) {
            campsBuilt = true;
            const order = s.enemies.map((enemy, index) => ({ index, x: enemy.x })).sort((a, b) => a.x - b.x);
            const gaps = order.slice(1).map((entry, k) => entry.x - order[k].x);
            const smallest = gaps.length > 0 ? Math.min(...gaps) : Number.POSITIVE_INFINITY;
            let camp = 1;
            order.forEach((entry, k) => {
              // A walk is a gap nothing else in the layout has: more than twice the tightest pair.
              if (k > 0 && gaps[k - 1] > smallest * 2) camp += 1;
              campOf.set(entry.index, camp);
              stat(camp);
            });
          }

          s.enemies.forEach((enemy, index) => {
            const camp = campOf.get(index);
            if (camp !== undefined) {
              const seen = hpSeen.get(index);
              if (seen !== undefined && enemy.hp < seen) stat(camp).hits += enemy.hp === seen ? 0 : seen - enemy.hp;
              hpSeen.set(index, enemy.hp);
              if (!enemy.alive && !deadSeen.has(index)) {
                deadSeen.add(index);
                const entry = stat(camp);
                const done = s.enemies.every((other, otherIndex) => other.alive || campOf.get(otherIndex) !== camp);
                if (done && entry.clearedAtMs === null) entry.clearedAtMs = Math.round(s.simMs);
              }
            }
            if (lastMode.get(index) === enemy.mode) return;
            if (enemy.mode === "windup") {
              tells += 1;
              if (camp !== undefined) stat(camp).tells += 1;
            }
            if (enemy.mode === "lunge") {
              lunges += 1;
              if (camp !== undefined) stat(camp).lunges += 1;
            }
            if (enemy.mode === "rest") restStart.set(index, frame);
            lastMode.set(index, enemy.mode);
          });

          const alive = s.enemies.filter((enemy) => enemy.alive);
          if (alive.length > 0) {
            const me = s.x + 10;
            const target = alive.reduce(
              (best, enemy) => (Math.abs(enemy.x + 10 - me) < Math.abs(best.x + 10 - me) ? enemy : best),
              alive[0],
            );
            const gap = Math.abs(target.x + 10 - me) - 20;
            const toward = target.x > s.x ? "ArrowRight" : "ArrowLeft";
            const away = toward === "ArrowRight" ? "ArrowLeft" : "ArrowRight";
            // The threat that matters is the one being fought. Reading every enemy made the bot
            // back off from a tell two bodies away and never stand still long enough to take a
            // window: measured on the two-camp level, 60 s of play with seven arrivals and one kill.
            const lunging = target.mode === "lunge";
            const telling = target.mode === "windup";
            lungeAge = lunging ? (wasLunging ? lungeAge + 1 : 0) : -1;
            wasLunging = lunging;

            const advance = () => {
              key(toward, true);
              key(away, false);
            };
            const retreat = () => {
              key(toward, false);
              key(away, true);
            };
            const stop = () => {
              key(toward, false);
              key(away, false);
            };
            const swing = () => {
              if (s.blade !== "idle") return;
              presses += 1;
              lastPress = frame;
              key("KeyJ", true);
              requestAnimationFrame(() => key("KeyJ", false));
            };

            const restAge = frame - (restStart.get(s.enemies.indexOf(target)) ?? frame);
            if (target.mode !== "rest") arrived = false;
            else if (gap <= HIT_GAP && !arrived) {
              arrived = true;
              arrivals.push(restAge);
            }

            if (mode === "bold") {
              // Bold: mash. Kept exactly as measured on 11-17 so the two strategies stay comparable.
              if (gap > 40) advance();
              else {
                stop();
                swing();
              }
            } else if (telling) {
              // Back off through the tell until the commit cannot reach, then stand: every extra
              // pixel of retreat is a pixel the open window has to buy back.
              if (gap < TELL_GAP) retreat();
              else stop();
            } else if (lunging) {
              // The commit covers 138 px in 300 ms. Retreat costs 160 px/s of gap, standing costs
              // 460 — but the retreat has to STOP before the commit does. Measured: a bot still
              // drifting away when the rest starts spends 125 ms reversing, which is most of the
              // window, so it swings late and the next tell finds it locked. Run for the first two
              // thirds, then stand, and the lunge ends a blade away with the feet already under the
              // body. Jumping is deliberately not here: every hit this bot took while jumping was
              // `grounded false`, caught in the air by the commit at gap 0.
              if (lungeAge < LUNGE_RUN_FRAMES || gap < LUNGE_GAP) retreat();
              else stop();
            } else if (target.mode === "rest") {
              // The window that pays, and only its first frames: a swing that starts late outlives
              // the window (300 ms of swing against 450 ms of rest, minus the arrival), so the tell
              // that follows finds the bot locked and the retreat never happens.
              if (gap > HIT_GAP) advance();
              else if (restAge <= REST_SWING_FRAMES) {
                stop();
                swing();
              } else stop();
            } else if (gap > WAIT_GAP) {
              // Close the distance, then HOLD by standing still — never by backing away. The enemy
              // walks at 74 px/s, so retreating to keep the line makes it walk forever: measured
              // 60 s of `tells 0 lunges 0`, a bot that never fought and blamed the game for it.
              advance();
            } else stop();
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    strategy,
  );
}

/* -------------------------------------------------------------------------------------------- *
 * Runner: three levels, taking off from windows derived from the level data.                    *
 * -------------------------------------------------------------------------------------------- */

const TILE = 32;

/** Deadly hazards, pits and steps for one level, in world px, derived from its rows. */
export function deriveRunPlan(rows) {
  const height = rows.length;
  const width = Math.max(...rows.map((row) => row.length));
  const cell = (column, row) => (rows[row] ?? "")[column] ?? ".";
  const solid = (column, row) => {
    const character = cell(column, row);
    return character === "#" || character === "=";
  };
  const ranges = (predicate) => {
    const found = [];
    let start = -1;
    for (let column = 0; column <= width; column += 1) {
      const inside = column < width && predicate(column);
      if (inside && start < 0) start = column;
      if (!inside && start >= 0) {
        found.push({ from: start * TILE, to: column * TILE });
        start = -1;
      }
    }
    return found;
  };
  // The surface is the topmost solid row in the bottom three: levels differ by a row.
  const surfaceRow = (column) => {
    for (let row = height - 3; row < height; row += 1) if (solid(column, row)) return row;
    return -1;
  };
  const pits = ranges((column) => surfaceRow(column) < 0);
  // A spike that has solid under it is standing on the surface and kills; one hanging in the air
  // (level 1) does not, and jumping under it is how you die for no reason.
  const hazards = ranges((column) => {
    for (let row = 0; row < height - 1; row += 1) {
      if (cell(column, row) === "^" && solid(column, row + 1)) return true;
    }
    return false;
  });
  const steps = ranges((column) => {
    const here = surfaceRow(column);
    const before = surfaceRow(Math.max(0, column - 1));
    return here >= 0 && before >= 0 && here < before;
  });
  return { pits, hazards, steps };
}

async function playRunner(page) {
  const state = () => page.evaluate(() => globalThis.__runnerState ?? null);
  const plans = JSON.parse(await readFile(join(ROOT, "examples/runner/src/levels.json"), "utf8")).map((level) => deriveRunPlan(level.rows));
  await page.waitForFunction("() => window.__runnerState && window.__runnerState.phase", null, { timeout: 20000 });

  await page.keyboard.down("Space");
  await page.waitForTimeout(150);
  await page.keyboard.up("Space");
  await page.waitForFunction("() => window.__runnerState.phase === 'play'", null, { timeout: 8000 });
  await page.keyboard.down("ArrowRight");

  const jumps = { pit: 0, step: 0, hazard: 0, walker: 0 };
  const reached = [];
  let lastLevel = 0;

  for (let i = 0; i < 8000; i += 1) {
    await page.waitForTimeout(16);
    const s = await state();
    if (s === null) continue;
    if (s.simMs > 90000) break;
    if (s.phase === "goal") {
      reached.push({ level: s.level, x: Math.round(s.x), simMs: s.simMs });
      break;
    }
    if (s.phase !== "play") continue;
    if (s.level !== lastLevel) {
      reached.push({ level: s.level, x: Math.round(s.x), simMs: s.simMs });
      lastLevel = s.level;
    }
    if (!s.grounded || s.blade !== undefined) {
      // runner has no blade, this is just the grounded gate
    }
    if (!s.grounded) continue;
    const plan = plans[s.level - 1];
    if (!plan) continue;
    const x = s.x;
    // A jump covers ~185 px at 320 px/s. Taking off `lead` px before a band must land past its end,
    // so lead stays under (185 - band width): 70 px for a pit, 60 for a 96 px spike band.
    const windowHit = (list, lead) => list.some((range) => x >= range.from - lead && x <= range.from - lead + 40);
    let jump = null;
    if (windowHit(plan.pits, 70)) jump = ["pit", 460];
    else if (windowHit(plan.steps, 50)) jump = ["step", 250];
    else if (windowHit(plan.hazards, 60)) jump = ["hazard", 460];
    else if ((s.enemies ?? []).some((enemy) => enemy.x - (x + 20) > 0 && enemy.x - (x + 20) < 130)) jump = ["walker", 300];
    if (jump) {
      await page.keyboard.down("Space");
      await page.waitForTimeout(jump[1]);
      await page.keyboard.up("Space");
      jumps[jump[0]] += 1;
    }
  }
  await page.keyboard.up("ArrowRight");
  const s = await state();
  if (s === null || s.phase === undefined) {
    // A page that never exposed its state is a broken measurement, not a lost run: say which.
    throw new Error("the runner page never exposed __runnerState — is examples/runner/dist built?");
  }
  return { phase: s.phase, level: s.level, levelCount: s.levelCount, deaths: s.deaths, simMs: s.simMs, x: Math.round(s.x), jumps, reached };
}

/* -------------------------------------------------------------------------------------------- */

async function main() {
  const [game, strategy = "bold"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const runsFlag = process.argv.indexOf("--runs");
  const runs = runsFlag >= 0 ? Number(process.argv[runsFlag + 1]) : 1;
  const json = process.argv.includes("--json");
  if (game !== "camp" && game !== "runner") {
    console.error("usage: play-bot.mjs camp <bold|careful> [--runs N] [--json] | play-bot.mjs runner [--runs N] [--json]");
    process.exit(2);
  }

  const dist = join(ROOT, "examples", game, "dist");
  const port = 4700 + Math.floor(Math.random() * 200);
  const server = await serveDist(dist, port);
  const browser = await launch();
  const results = [];
  try {
    for (let run = 0; run < runs; run += 1) {
      const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
      const errors = [];
      page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
      const ident = await bundleOf(page);
      const result = game === "camp" ? await playCamp(page, strategy) : await playRunner(page);
      results.push({ run: run + 1, ...ident, ...result, consoleErrors: errors });
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
  }

  const ok =
    game === "camp"
      ? results.every((r) => r.phase === "clear" && r.consoleErrors.length === 0)
      : results.every((r) => r.phase === "goal" && r.level === r.levelCount && r.consoleErrors.length === 0);

  if (json) {
    console.log(JSON.stringify({ game, strategy: game === "camp" ? strategy : null, ok, results }, null, 1));
  } else {
    for (const r of results) {
      if (game === "camp") {
        console.log(
          `run ${r.run}  ${r.phase}  hearts ${r.hearts}  hits ${r.hits}  kills ${r.kills}  ${r.simMs} ms  ` +
            `tells ${r.tells}  lunges ${r.lunges}  presses ${r.presses}  arrived ${JSON.stringify(r.arrivals)}  ` +
            `errors ${r.consoleErrors.length}  ${r.bundle}`,
        );
        console.log(`   camps ${JSON.stringify(r.camps)}`);
        if (r.lost.length > 0) console.log(`   lost ${JSON.stringify(r.lost)}`);
      } else {
        const jump = Object.entries(r.jumps).map(([kind, n]) => `${kind} ${n}`).join(" ");
        console.log(
          `run ${r.run}  ${r.phase}  level ${r.level}/${r.levelCount}  deaths ${r.deaths}  ${r.simMs} ms  ` +
            `${jump}  errors ${r.consoleErrors.length}  ${r.bundle}`,
        );
      }
    }
    console.log(`${game}${game === "camp" ? ` ${strategy}` : ""}: ${ok ? "ok" : "FAILED"}`);
  }
  process.exit(ok ? 0 : 1);
}

// Importable for its pure parts (the take-off derivation), runnable as a script.
const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  await main();
}
