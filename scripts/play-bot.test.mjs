import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { deriveRunPlan } from "./play-bot.mjs";

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
