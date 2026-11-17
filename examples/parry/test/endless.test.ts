import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_CONCURRENT, concurrentAt, speedRampAt, wrapAxis } from "../src/endless.ts";

test("the first thirty seconds are the pace the player learns on", () => {
  assert.equal(speedRampAt(0), 1);
  assert.equal(speedRampAt(29.9), 1);
  assert.equal(concurrentAt(0), 1);
  assert.equal(concurrentAt(29.9), 1);
});

test("the run steps up every thirty seconds", () => {
  assert.equal(speedRampAt(30), 1.1);
  assert.equal(speedRampAt(59.9), 1.1);
  assert.equal(speedRampAt(60), 1.2);
  assert.equal(concurrentAt(30), 2);
  assert.equal(concurrentAt(60), 3);
});

test("the steps stop at a cap the player can still read", () => {
  assert.equal(concurrentAt(90), 4);
  assert.equal(concurrentAt(900), MAX_CONCURRENT);
  assert.ok(speedRampAt(900) > speedRampAt(300), "the speed ramp has no cap of its own");
});

test("a negative clock is the start of the run, not a step backwards", () => {
  assert.equal(speedRampAt(-5), 1);
  assert.equal(concurrentAt(-5), 1);
});

test("an enemy that leaves one side comes back on the other", () => {
  const size = 1200;
  const margin = 40;
  assert.equal(wrapAxis(600, size, margin), 600, "inside the arena nothing moves");
  assert.equal(wrapAxis(-margin, size, margin), -margin, "the edge itself is still inside");
  assert.equal(wrapAxis(-margin - 1, size, margin), size + margin);
  assert.equal(wrapAxis(size + margin + 1, size, margin), -margin);
});
