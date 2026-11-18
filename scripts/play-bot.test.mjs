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
