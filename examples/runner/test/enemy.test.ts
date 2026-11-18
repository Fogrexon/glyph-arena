import assert from "node:assert/strict";
import { test } from "node:test";

import { CHASE } from "../src/enemy.ts";

/**
 * The numbers that stay in the game are the feel; the rule's boundaries (224 px in, 225 out, a
 * one-tile lip) moved to `@fogrexon/glyph-arena-chase` with the rule itself, where they are tested
 * against the specification rather than against a copy of the constant.
 */
test("the pursuer is slower than the run, by the numbers", () => {
  assert.ok(CHASE.speedPxPerSecond < 320, "a pursuer that outruns the runner turns the level into a coin flip");
  assert.equal(Math.round((CHASE.sightPx / CHASE.speedPxPerSecond) * 100) / 100, 2.49);
});

test("it waits a second before it starts, and gives up after 1.5 s off-screen", () => {
  assert.equal(CHASE.startSeconds, 1);
  assert.equal(CHASE.loseSightSeconds, 1.5);
});

test("it no longer owns a step tolerance — the rule takes one, and this game passes 0 (flat only)", () => {
  assert.equal("stepTolerancePx" in CHASE, false);
});
