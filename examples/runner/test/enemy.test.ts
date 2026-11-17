import assert from "node:assert/strict";
import { test } from "node:test";

import { CHASE, keepsChasing, startsChasing } from "../src/enemy.ts";

/**
 * The boundary is the whole rule: 224 px in, 225 px out. A test that checks "far away / very
 * close" passes for both a correct and an off-by-a-tile implementation.
 */
test("pursuit starts at 224 px and not at 225, on either side", () => {
  const base = { stepPx: 0, elapsedSeconds: 2 };
  assert.equal(startsChasing({ ...base, distancePx: 224 }), true);
  assert.equal(startsChasing({ ...base, distancePx: 225 }), false);
  assert.equal(startsChasing({ ...base, distancePx: -224 }), true);
  assert.equal(startsChasing({ ...base, distancePx: -225 }), false);
  assert.equal(startsChasing({ ...base, distancePx: 0 }), true);
});

test("pursuit waits 1.0 s of play: 0.99 s is not enough", () => {
  const base = { stepPx: 0, distancePx: 100 };
  assert.equal(startsChasing({ ...base, elapsedSeconds: 0.99 }), false);
  assert.equal(startsChasing({ ...base, elapsedSeconds: 1 }), true);
});

test("a one-tile lip is the limit for noticing, and a hole is never noticed", () => {
  const base = { distancePx: 100, elapsedSeconds: 2 };
  assert.equal(startsChasing({ ...base, stepPx: CHASE.stepTolerancePx }), true);
  assert.equal(startsChasing({ ...base, stepPx: CHASE.stepTolerancePx + 1 }), false);
  assert.equal(startsChasing({ ...base, stepPx: Number.POSITIVE_INFINITY }), false);
});

test("a pursuit only walks on flat floor: it does not climb, and does not walk off a ledge", () => {
  assert.equal(keepsChasing(0), true);
  assert.equal(keepsChasing(CHASE.stepTolerancePx), false);
  assert.equal(keepsChasing(-CHASE.stepTolerancePx), false);
  assert.equal(keepsChasing(Number.POSITIVE_INFINITY), false);
});

test("the pursuer is slower than the run, by the numbers", () => {
  // The pressure has to come from standing still, not from speed: 224 px at 90 px/s is 2.49 s.
  assert.ok(CHASE.speedPxPerSecond < 320, "a pursuer that outruns the runner turns the level into a coin flip");
  assert.equal(Math.round(CHASE.sightPx / CHASE.speedPxPerSecond * 100) / 100, 2.49);
});
