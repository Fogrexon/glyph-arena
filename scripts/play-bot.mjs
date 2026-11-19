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
 *   node scripts/play-bot.mjs march bold|careful|run|rush|mixed [--runs 2] [--json]
 *
 * Needs a built slice (`pnpm -r build`). `E2E_CHROMIUM=/path/to/chrome` picks the browser, the
 * same variable the e2e scripts read. Exit code is 0 only when every run met its expectation:
 * a cleared camp, `goal` at the last runner level, or — for march, which is a measurement rather
 * than a pass/fail on winning — a run that ended either way and could be restarted in a frame.
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
  if (executablePath !== undefined) return chromium.launch({ executablePath, args: ["--no-sandbox"] });
  // The same fallback the e2e gates use: `playwright-core` ships no browser, so a bare
  // `chromium.launch()` only works where someone ran `playwright install`. On a GitHub runner it
  // throws `Executable doesn't exist at ~/.cache/ms-playwright/...` — measured 2026-11-18, when
  // `e2e:runner` started calling this bot.
  return chromium.launch({ channel: process.env.E2E_CHANNEL ?? "chrome", args: ["--no-sandbox"] });
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
        let lastHearts = -1;

        // The number this unit exists to find: how long between one commit starting and the next.
        // With one enemy it is `restMs + windup`; with three it is whatever the stagger makes it,
        // and a roll that locks steering for 180 ms only works if that number is bigger.
        const lungeStarts = [];
        const commitStarts = [];
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
            dangerGapMs: lungeStarts.slice(1).map((at, index) => at - lungeStarts[index]),
            commitGapMs: commitStarts.slice(1).map((at, index) => at - commitStarts[index]),
          });
        };

        const tick = () => {
          const s = window.__campState;
          if (!s) return requestAnimationFrame(tick);
          frame += 1;
          if (s.phase !== "play") return finish();
          // A run that never ends is a measurement that lies: stop it and say so.
          if (s.simMs > 60000) return finish();
          if (lastHearts < 0) lastHearts = s.hearts;
          if (s.hearts < lastHearts) {
            // A hit is only useful as a number if it says what the bot was doing: locked in its own
            // swing, in the air, or free and simply in the wrong place.
            const all = s.enemies
              .filter((enemy) => enemy.alive)
              .map((enemy) => ({ mode: enemy.mode, gap: Math.round(Math.abs(enemy.x + 10 - (s.x + 10)) - 20) }))
              .sort((a, b) => a.gap - b.gap);
            // The game only damages on a *lunging* overlap, so the culprit is a lunging enemy —
            // not the nearest one. Blaming the nearest dropped a hit whenever the offender died on
            // the same frame: measured, five hits and four attributed.
            const blame = s.enemies
              .map((enemy, index) => ({ index, enemy, gap: Math.abs(enemy.x + 10 - (s.x + 10)) }))
              .filter((entry) => entry.enemy.mode === "lunge")
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
              commitStarts.push(Math.round(s.simMs));
              if (camp !== undefined) stat(camp).tells += 1;
            }
            if (enemy.mode === "lunge") {
              lunges += 1;
              lungeStarts.push(Math.round(s.simMs));
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
              // Bold: mash.
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
              // `grounded false`, caught in the air by the commit at gap 0. The roll is not here
              // either — see the CHANGELOG: every policy that used it measured worse.
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
 * March: the same road five ways — fight every guard, roll through all of them, just walk, run    *
 * with the roll spent on every cooldown, or roll the singles and fight the pairs.                *
 *                                                                                               *
 * `run` and `rush` exist to split one sentence into two measurements, because "can you clear by  *
 * running" is two questions: does walking pass a body at all (`run`: no swing, no roll), and is   *
 * the roll enough when it is always available (`rush`: roll on cooldown). `bold` answers neither  *
 * — it rolls only when a body is 22 px away, so its 7.4 s death at the pairs could be timing.     *
 *                                                                                               *
 * `mixed` is the policy a player converges on: a guard who is alone is a roll, a guard with a     *
 * partner is a fight. It is the only hand that answers "is there a line to the goal between       *
 * fighting everything and dying at the pairs".                                                   *
 * -------------------------------------------------------------------------------------------- */

async function playMarch(page, strategy) {
  await page.waitForFunction("() => window.__marchState && window.__marchState.phase", null, { timeout: 20000 });
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
        // A press has to outlive one game tick. The game's frame is not this frame: a keydown that
        // is released inside the frame it was sent in is a press the game never samples — measured
        // on this harness, a one-frame `R` left a dead run dead for 31 frames and the retry looked
        // broken when it was the instrument. Three frames is one press and no auto-repeat.
        const pulses = new Map();
        const PULSE_FRAMES = 3;
        const press = (code) => pulses.set(code, PULSE_FRAMES);
        const runPulses = () => {
          for (const [code, left] of [...pulses]) {
            if (left === PULSE_FRAMES) key(code, true);
            if (left <= 1) {
              key(code, false);
              pulses.delete(code);
            } else pulses.set(code, left - 1);
          }
        };

        // Read off the game, not tuned here. The roll's invulnerable window is 140 ms of 520 px/s
        // = 73 px of travel, and a 20 px body is clear of a 20 px guard once its left edge reaches
        // the guard's right edge — that costs `gap + 40` px, so the roll has to start near 20 px
        // of gap to have margin. Later and it ends touching; earlier and the window is spent in
        // the air before the bodies meet.
        const ROLL_GAP = 22;
        // Two guards whose **posts** are closer than this are a pair, and a pair is the one place a
        // roll does not
        // finish the job: 73 px of travel lands the body between the two, with the window spent and
        // the second guard's commit already started. Posts, not bodies: a guard mid-lunge is 138 px
        // from his post, so measuring bodies turns a pair into two singles for the whole tell — that
        // is what made the first version of this hand roll past the first pair and stall at 709. On this road the singles stand 320–448 px
        // apart and the pairs 96 (and the triples 64), so anything that separates those two
        // populations is the right number — 130 is not tuned, it is the middle of a gap.
        // `scripts/play-bot.test.mjs` derives both edges from the level, so moving a guard until
        // the threshold stops separating them turns the gate red instead of quietly mislabelling
        // a pair as a single.
        const PAIR_PX = 130;
        // The fight has to answer one thing CAMP's fight never asked: a body you push into costs a
        // heart, so the line you hold between commits is a distance the next tell has to cross
        // badly. The lunge covers 138 px from a 70 px trigger, so 110 px held is 40 px of margin.
        const HIT_GAP = 26;
        // A guard commits at 70 and does not walk, so the line to hold is inside his trigger — 60
        // is close enough to start the tell on purpose and far enough that the tell is the thing
        // you are reading, not the first frame of the lunge.
        const WAIT_GAP = 60;
        const TELL_GAP = 120;
        // Retreat only for the first ~third of the commit: back off for all 300 ms and the guard
        // stops 200 px away, and 450 ms of rest cannot buy that distance back. Standing for the
        // rest of the commit is what leaves the guard 40 px away with the window just opened.
        const LUNGE_RUN_MS = 200;
        // A swing is 300 ms (60 windup + 90 active + 150 recovery) and the rest is 450 ms. Start one
        // with less than that left and the recovery is still out when the next tell begins — the
        // body cannot steer, so it stands in the 138 px commit and takes it.
        const SWING_MS = 300;
        const REST_MS = 450;
        const SWING_MARGIN_MS = 40;

        let rolls = 0;
        // A held set that says "pressed" is not the same as the game having heard it. Measured on
        // 11-19: a `march mixed` run froze at x 2526 with the road clear and `vx 0` — no guard
        // within 400 px, hearts 4 — which the game cannot produce from input it received. So when
        // the road ahead is clear and the body is not moving, re-send the key instead of trusting
        // the set. `kicks` is printed: a non-zero count means the harness lost a key, and the run
        // that needed it is the evidence, not a guess.
        let stuckFrames = 0;
        let kicks = 0;
        let swings = 0;
        let ended = null;
        let pressedRetry = false;
        let retryFrames = 0;
        let runsAfter = null;

        const finish = () => {
          for (const code of [...held]) key(code, false);
          pulses.clear();
          const s = ended ?? window.__marchState;
          resolve({
            phase: s.phase,
            hearts: s.hearts,
            passes: s.passes,
            killed: s.kills,
            simMs: s.simMs,
            x: Math.round(s.x),
            hits: s.hits.length,
            hitLog: s.hits.map((hit) => `${hit.mode}@${hit.atMs}ms x${hit.x} ${hit.cause}`),
            hitsFromBehind: s.hits.filter((hit) => hit.cause === "passing").length,
            enemyCount: s.enemies.length,
            runs: s.runs,
            rolls,
            swings,
            kicks,
            retryFrames: pressedRetry ? retryFrames : null,
            runsAfter,
          });
        };

        const tick = () => {
          const s = window.__marchState;
          if (!s) return requestAnimationFrame(tick);
          runPulses();

          // The retry is one press and one frame: this is the number a one-minute game lives on,
          // and it is measured rather than asserted. The "it came back" check has to run BEFORE
          // the play branch, or a successful retry is read as "keep playing" and the run never
          // ends (measured: a working retry reported as 31 dead frames).
          if (pressedRetry && s.phase === "play") {
            runsAfter = s.runs;
            return finish();
          }
          if (s.phase !== "play") {
            if (!pressedRetry) {
              ended = s;
              pressedRetry = true;
              press("KeyR");
              return requestAnimationFrame(tick);
            }
            retryFrames += 1;
            if (retryFrames > 30) return finish();
            return requestAnimationFrame(tick);
          }

          // A run that never ends is a measurement that lies: stop it and say so.
          if (s.simMs > 120000) return finish();

          if (mode === "run") {
            // One key, for the whole road. This hand exists to answer exactly one question — can
            // the road be cleared without fighting anything — so it must not borrow the answers
            // the other two hands are built on: no swing (that is `careful`), no roll (that is
            // `bold`). Both would make the result unreadable: a hit taken during a roll may be the
            // roll's fault, and a kill is a fight. If walking cannot clear the road, that is the
            // measurement, not a broken hand.
            key("ArrowRight", true);
            return requestAnimationFrame(tick);
          }

          if (mode === "rush") {
            // `run`, with the roll spent as fast as it comes back. This is the hand that answers
            // "is the roll enough": `bold` spends it only when a body is 22 px away, so its death
            // at the pairs could be a timing mistake. Rolling on every cooldown takes the timing
            // out of the question — whatever this still dies at is geometry, not the press.
            key("ArrowRight", true);
            if (s.dodge === "idle") {
              rolls += 1;
              press("ShiftLeft");
            }
            return requestAnimationFrame(tick);
          }

          const ahead = s.enemies
            .filter((enemy) => enemy.alive && enemy.x + 20 > s.x)
            .sort((a, b) => a.x - b.x);
          const target = ahead[0];
          if (target === undefined) {
            if (Math.abs(s.vx) < 1) stuckFrames += 1;
            else stuckFrames = 0;
            if (stuckFrames > 30) {
              kicks += 1;
              stuckFrames = 0;
              key("ArrowRight", false);
            }
            key("ArrowRight", true);
            return requestAnimationFrame(tick);
          }
          const gap = target.x - (s.x + 20);

          // `mixed` is the hand a player actually finds: spend the roll on a guard who is alone,
          // fight the ones who are not. It is one line of policy over the two hands that already
          // exist, and it is the only hand that can answer the question the others cannot — is
          // there a line between "fight every guard, 65 s, untouched" and "roll through all of
          // them, 7.8 s, dead at the pairs" that actually gets to the goal.
          const partner =
            mode === "mixed" &&
            s.enemies.some(
              (enemy) => enemy.alive && enemy !== target && Math.abs(enemy.homeX - target.homeX) < PAIR_PX,
            );
          const goingBy = mode === "bold" || (mode === "mixed" && !partner);

          if (goingBy) {
            // Go by everything you can: never swing, never stop. The roll is the only way through a
            // body, so this run is "is the fast road affordable" and its hearts are the answer.
            key("ArrowRight", true);
            // Roll at any mode: the window starts on the frame the roll does, so crossing a
            // commit and crossing a standing guard are the same 73 px of travel. Refusing the
            // lunge was measured worse — the bot ran into the commit instead of through it.
            if (gap <= ROLL_GAP && gap > -8 && s.dodge === "idle") {
              rolls += 1;
              press("ShiftLeft");
            }
          } else if (gap < 0) {
            // Already inside it — the only way out of a body is forward.
            key("ArrowLeft", false);
            key("ArrowRight", true);
          } else if (target.mode === "windup") {
            // Back off through the tell until the 138 px commit cannot reach.
            if (gap < TELL_GAP) {
              key("ArrowRight", false);
              key("ArrowLeft", true);
            } else {
              key("ArrowLeft", false);
              key("ArrowRight", false);
            }
          } else if (target.mode === "lunge") {
            // Back off for the first two thirds, then stand and let it come: the commit is 138 px
            // against a 70 px trigger, so a body that keeps running spends the whole commit and
            // ends the rest two hundred pixels away — too far to reach inside 450 ms. Standing for
            // the last third is what arrives with the guard in front of you and the window open.
            if (target.modeMs < LUNGE_RUN_MS) {
              key("ArrowRight", false);
              key("ArrowLeft", true);
            } else {
              key("ArrowLeft", false);
              key("ArrowRight", false);
            }
          } else if (target.mode === "rest") {
            // The window that pays: step in and spend it, immediately.
            key("ArrowLeft", false);
            if (gap > HIT_GAP) key("ArrowRight", true);
            else if (target.modeMs + SWING_MS + SWING_MARGIN_MS > REST_MS) {
              // No room for a swing in what is left of the window: hold, do not start one whose
              // recovery would still be out when the guard wakes up.
              key("ArrowRight", false);
            } else if (s.facing !== 1) {
              // The blade comes out of the side the body is facing, and this bot spends the tell
              // retreating — so the guard arrives in front of a body still facing the way it ran.
              // Measured: 20 swings and not one kill, because every one of them was thrown
              // backwards. Turn first, then swing.
              key("ArrowRight", true);
            } else {
              key("ArrowRight", false);
              if (s.blade === "idle") {
                swings += 1;
                press("KeyJ");
              }
            }
          } else if (gap > WAIT_GAP) {
            // Close the distance, then hold by standing still — never by backing away, or a guard
            // that does not walk is walked away from forever.
            key("ArrowLeft", false);
            key("ArrowRight", true);
          } else {
            key("ArrowRight", false);
            key("ArrowLeft", false);
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
  if (game !== "camp" && game !== "runner" && game !== "march") {
    console.error(
      "usage: play-bot.mjs camp <bold|careful> [--runs N] [--json] | play-bot.mjs runner [--runs N] [--json] | play-bot.mjs march <bold|careful|run|rush|mixed> [--runs N] [--json]",
    );
    process.exit(2);
  }
  // A strategy the game does not have is a silently different measurement: `march rum` would fall
  // through every branch to "walk to the next guard and hold", which is `careful` without a sword.
  const MARCH_HANDS = ["bold", "careful", "run", "rush", "mixed"];
  if (game === "march" && !MARCH_HANDS.includes(strategy)) {
    console.error(`march has no hand called "${strategy}": ${MARCH_HANDS.join(", ")}`);
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
      const result =
        game === "camp" ? await playCamp(page, strategy) : game === "march" ? await playMarch(page, strategy) : await playRunner(page);
      results.push({ run: run + 1, ...ident, ...result, consoleErrors: errors });
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
  }

  // March is a measurement, not a pass/fail on winning: a run that ends either way is a result,
  // but a run that ends and cannot be restarted in a frame is a broken game, so that is required.
  const ok =
    game === "camp"
      ? results.every((r) => r.phase === "clear" && r.consoleErrors.length === 0)
      : game === "march"
        ? results.every(
            (r) =>
              (r.phase === "clear" || r.phase === "down") &&
              r.consoleErrors.length === 0 &&
              r.retryFrames !== null &&
              r.retryFrames <= 3 &&
              r.runsAfter === r.runs + 1,
          )
        : results.every((r) => r.phase === "goal" && r.level === r.levelCount && r.consoleErrors.length === 0);

  if (json) {
    console.log(JSON.stringify({ game, strategy: game === "camp" || game === "march" ? strategy : null, ok, results }, null, 1));
  } else {
    for (const r of results) {
      if (game === "camp") {
        console.log(
          `run ${r.run}  ${r.phase}  hearts ${r.hearts}  hits ${r.hits}  kills ${r.kills}  ${r.simMs} ms  ` +
            `tells ${r.tells}  lunges ${r.lunges}  presses ${r.presses}  arrived ${JSON.stringify(r.arrivals)}  ` +
            `errors ${r.consoleErrors.length}  ${r.bundle}`,
        );
        console.log(`   camps ${JSON.stringify(r.camps)}`);
        if (r.dangerGapMs.length > 0) {
          const gaps = [...r.dangerGapMs].sort((a, b) => a - b);
          const median = gaps[Math.floor(gaps.length / 2)];
          console.log(`   danger gap: median ${median} ms  min ${gaps[0]}  n ${gaps.length}`);
        }
        if (r.commitGapMs.length > 0) {
          // The rule spaces *commits*, so this is the number it can be compared with directly.
          // The lunge gap is one tell later, and hitstop pauses the tell without pausing the clock.
          const gaps = [...r.commitGapMs].sort((a, b) => a - b);
          const median = gaps[Math.floor(gaps.length / 2)];
          console.log(`   commit gap: median ${median} ms  min ${gaps[0]}  n ${gaps.length}`);
        }
        if (r.lost.length > 0) console.log(`   lost ${JSON.stringify(r.lost)}`);
      } else if (game === "march") {
        console.log(
          `run ${r.run}  ${r.phase}  hearts ${r.hearts}  passed ${r.passes}/${r.enemyCount}  killed ${r.killed}  ` +
            `x ${r.x}  ${r.simMs} ms  hits ${r.hits} (${r.hitsFromBehind} from behind)  rolls ${r.rolls}  swings ${r.swings}  ` +
            `retry ${r.retryFrames} frame(s)  kicks ${r.kicks}  errors ${r.consoleErrors.length}  ${r.bundle}`,
        );
        if (r.hitLog !== undefined && r.hitLog.length > 0) console.log(`   hits by mode: ${r.hitLog.join(" | ")}`);
      } else {
        const jump = Object.entries(r.jumps).map(([kind, n]) => `${kind} ${n}`).join(" ");
        console.log(
          `run ${r.run}  ${r.phase}  level ${r.level}/${r.levelCount}  deaths ${r.deaths}  ${r.simMs} ms  ` +
            `${jump}  errors ${r.consoleErrors.length}  ${r.bundle}`,
        );
      }
    }
    console.log(`${game}${game === "camp" || game === "march" ? ` ${strategy}` : ""}: ${ok ? "ok" : "FAILED"}`);
  }
  process.exit(ok ? 0 : 1);
}

// Importable for its pure parts (the take-off derivation), runnable as a script.
const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  await main();
}
