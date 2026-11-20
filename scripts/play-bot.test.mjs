import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { deriveRunPlan, formatStandstill } from "./play-bot.mjs";

const ROOT = join(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "..");
const levels = JSON.parse(readFileSync(join(ROOT, "examples/runner/src/levels.json"), "utf8"));

test("the take-off windows come from the level data, not from a list in the bot", () => {
  const three = deriveRunPlan(levels[2].rows);
  assert.deepEqual(
    three.hazards.map((range) => [range.from, range.to]),
    [[320, 384], [704, 768], [1472, 1536]],
    "level 3's three spike bands",
  );
  assert.deepEqual(
    three.pits.map((range) => [range.from, range.to]),
    [[1280, 1376], [1856, 1952]],
    "level 3's two pits",
  );
});

test("a spike hanging over the running line is not a take-off: only one standing on the floor kills", () => {
  const one = deriveRunPlan(levels[0].rows);
  assert.deepEqual(one.hazards, [], "level 1's spikes hang a tile above the floor and must not be jumped under");
  assert.deepEqual(one.pits.map((range) => [range.from, range.to]), [[1088, 1184]]);
});

test("a spike on a plateau is deadly, because the plateau is the floor there", () => {
  const two = deriveRunPlan(levels[1].rows);
  assert.deepEqual(two.hazards.map((range) => [range.from, range.to]), [[1152, 1248]]);
  assert.equal(two.steps.length, 1, "the step up onto the plateau is a take-off too");
});

test("the march hand called `run` only runs: it never swings and never rolls", () => {
  // The pass line is "you can clear by walking, but not untouched". Both halves of that sentence
  // are only readable if the hand that measures it does nothing else: a swing is a fight, and a
  // roll is what the other fast hand is made of — a hit taken mid-roll may be the roll's fault
  // rather than the road's, which is exactly the ambiguity this hand was added to remove.
  // A later "it does not clear, so let it roll" edit would quietly turn the measurement back into
  // `bold`, so the property is checked instead of the number it produced.
  const source = readFileSync(join(ROOT, "scripts/play-bot.mjs"), "utf8");
  const body = /if \(mode === "run"\) \{([\s\S]*?)\n          \}/.exec(source)?.[1] ?? "";
  assert.ok(body.length > 0, "the march `run` hand is gone from play-bot.mjs");
  assert.match(body, /key\("ArrowRight", true\)/, "the `run` hand does not hold right");
  assert.doesNotMatch(body, /press\(/, "the `run` hand presses a key — it is no longer the hand that only walks");
  assert.doesNotMatch(body, /KeyJ|Shift/, "the `run` hand swings or rolls");

  const hands = /const MARCH_HANDS = \[([^\]]*)\]/.exec(source)?.[1] ?? "";
  assert.match(hands, /"run"/, "`march run` is no longer accepted on the command line");
});

test("the mixed hand's pair threshold still separates the road's pairs from its singles", () => {
  // `mixed` rolls a guard who is alone and fights a guard who is not. Both halves of that rule are
  // a single number, and a number typed once is exactly what goes stale when a guard moves: one
  // pixel the wrong way and a pair is rolled like a single (the death `bold` measures) or a single
  // is fought like a pair (the 65 s the fast line exists to avoid). So the road's own spacing
  // decides the bound — pairs inside a beat, singles across the 6-tile walks between beats, the
  // same derivation `march-readme.test.mjs` uses for "beats".
  const level = readFileSync(join(ROOT, "examples/march/src/level.ts"), "utf8");
  const block = /const TEXT: readonly string\[\] = \[([\s\S]*?)\n\];/.exec(level)?.[1] ?? "";
  const rows = [...block.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
  const standing = rows.findIndex((row) => row.includes("@"));
  assert.ok(standing >= 0, "no spawn row in the march level");
  const tile = Number(/export const TILE = (\d+);/.exec(level)?.[1]);
  const columns = [...rows[standing]].map((cell, column) => (cell === "e" ? column : -1)).filter((column) => column >= 0);
  const px = columns.map((column) => column * tile);
  const gaps = px.slice(1).map((x, i) => x - px[i]);
  const walk = 6 * tile;
  const insideBeat = gaps.filter((gap) => gap <= walk);
  const acrossBeat = gaps.filter((gap) => gap > walk);
  assert.ok(insideBeat.length > 0 && acrossBeat.length > 0, "the road no longer has both pairs and singles to separate");

  const source = readFileSync(join(ROOT, "scripts/play-bot.mjs"), "utf8");
  const pairPx = Number(/const PAIR_PX = (\d+);/.exec(source)?.[1]);
  assert.ok(Number.isFinite(pairPx), "the mixed hand's PAIR_PX is gone");
  assert.ok(
    pairPx > Math.max(...insideBeat),
    `PAIR_PX ${pairPx} does not cover the road's closest pair (${Math.max(...insideBeat)} px) — the mixed hand would roll a pair`,
  );
  assert.ok(
    pairPx < Math.min(...acrossBeat),
    `PAIR_PX ${pairPx} reaches across a beat break (${Math.min(...acrossBeat)} px) — the mixed hand would fight a single`,
  );
  assert.match(source, /mode === "mixed" && !partner/, "the mixed hand no longer tells a pair from a single");
});

test("a stalled hand reports what it was standing in front of, not just where", () => {
  // Measured 11-20: `march mixed` stood at x 1536 for 120 s of sim time and the run printed the
  // position only. `walk 4600 ms` and `windup 120 ms` are different bugs with different fixes, and
  // only the guard's state tells them apart.
  const asleep = formatStandstill({
    frames: 180,
    x: 1536,
    gap: 44,
    target: { home: 1606, x: 1600, mode: "walk", ms: 4615, alert: true, passed: false },
  });
  assert.match(asleep, /still 180 frame\(s\) at x 1536/);
  assert.match(asleep, /home 1606 body 1600 gap 44/);
  assert.match(asleep, /walk 4615 ms/, "the guard's mode and how long it has held it");
  assert.match(asleep, / alert/, "a guard who was woken behaves differently and the line says so");
  assert.doesNotMatch(asleep, /passed/, "this one was not passed");

  const dancing = formatStandstill({
    frames: 180,
    x: 900,
    gap: 12,
    target: { home: 902, x: 896, mode: "windup", ms: 120, alert: false, passed: true },
  });
  assert.match(dancing, /windup 120 ms/);
  assert.match(dancing, / passed/);
  assert.match(dancing, / offPost/, "a body 6 px off its post cannot commit, which is a third cause");
});

test("the stall that reproduced on 11-20 is named as a clear road with keys re-sent", () => {
  // `march mixed` froze at x 2526 for 120 s on main's own road (1 run in 6, 11-20) with `kicks 173`:
  // the harness re-sent the key 173 times and the body did not move. That is not a hand that
  // stopped — the hand was holding right — so the line has to say what the *world* was doing.
  const line = formatStandstill(
    { frames: 31, x: 2526, gap: null, vx: 0, hearts: 3, keys: [], target: null },
    173,
  );
  assert.match(line, /road clear/);
  assert.match(line, /vx 0/, "the body is not moving, which is what the game cannot produce from input it heard");
  assert.match(line, /keys re-sent 173x/, "the kick count is the proof the harness did its part");
  assert.match(line, /hearts 3/);
  assert.match(line, /game sees none/, "an empty key set is the input's fault, and the line says so");
});

test("a body that has the key but does not move is a different bug, and reads as one", () => {
  // The other half of the same symptom: the game has ArrowRight and still stands. That is movement,
  // not input, and the two must never be confused again.
  const line = formatStandstill(
    { frames: 31, x: 2526, gap: null, vx: 0, hearts: 3, keys: ["ArrowRight"], target: null },
    12,
  );
  assert.match(line, /game sees ArrowRight/);
  assert.match(line, /vx 0/);
});
