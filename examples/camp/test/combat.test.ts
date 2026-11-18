import assert from "node:assert/strict";
import { test } from "node:test";

import { ATTACK, attackBox, attackPhase, beginAttack, overlaps, stepAttack } from "../src/combat.ts";
import { ENEMY_AI, canInterrupt, modeRemainingMs, wantsLunge } from "../src/enemy.ts";

const TOTAL = ATTACK.windupMs + ATTACK.activeMs + ATTACK.recoveryMs;

test("the swing is windup, then active, then recovery, then gone", () => {
  assert.equal(attackPhase(-1), "idle");
  assert.equal(attackPhase(0), "windup");
  assert.equal(attackPhase(ATTACK.windupMs - 1), "windup");
  assert.equal(attackPhase(ATTACK.windupMs), "active");
  assert.equal(attackPhase(ATTACK.windupMs + ATTACK.activeMs - 1), "active");
  assert.equal(attackPhase(ATTACK.windupMs + ATTACK.activeMs), "recovery");
  assert.equal(attackPhase(TOTAL - 1), "recovery");
  assert.equal(attackPhase(TOTAL), "idle");
});

test("the blade starts at the shoulder and points the way the player faces", () => {
  const body = { x: 100, y: 50, w: 20, h: 28 };
  const right = attackBox(body, 1);
  const left = attackBox(body, -1);
  assert.equal(right.left, body.x + body.w - 4);
  assert.equal(right.right, body.x + body.w + ATTACK.reachPx);
  assert.equal(left.right, body.x + 4);
  assert.equal(left.left, body.x - ATTACK.reachPx);
  assert.ok(Math.abs(right.right - right.left - (ATTACK.reachPx + 4)) < 1e-9);
});

test("a swing that is over is idle, and a new swing forgets the last one hit", () => {
  const attack = { elapsedMs: -1, hasHit: true, facing: 1 as 1 | -1 };
  beginAttack(attack, -1);
  assert.equal(attack.elapsedMs, 0);
  assert.equal(attack.hasHit, false);
  assert.equal(attack.facing, -1);
  stepAttack(attack, TOTAL);
  assert.equal(attack.elapsedMs, -1, "a swing ends on the frame it runs out");
});

test("overlap is half-open: touching edges do not connect", () => {
  const a = { left: 0, top: 0, right: 10, bottom: 10 };
  assert.equal(overlaps(a, { left: 9, top: 9, right: 19, bottom: 19 }), true);
  assert.equal(overlaps(a, { left: 10, top: 0, right: 20, bottom: 10 }), false);
  assert.equal(overlaps(a, { left: 0, top: 10, right: 10, bottom: 20 }), false);
});

test("the enemy commits only up close, on the ground, and only from a walk", () => {
  // Derived from the range itself: the number is the game's, and a test that writes its own copy
  // of it fails when the fight is tuned, which is the test's job to allow and the tuning's job to
  // answer for.
  const inside = ENEMY_AI.lungeRangePx - 10;
  const outside = ENEMY_AI.lungeRangePx + 90;
  assert.equal(ENEMY_AI.lungeRangePx + 10 < ENEMY_AI.lungeSpeedPxPerSecond * (ENEMY_AI.lungeMs / 1000), true, "the commit out-reaches the place it starts from");
  assert.equal(wantsLunge("walk", 0, inside, true), true);
  assert.equal(wantsLunge("walk", 0, outside, true), false, "far away it keeps walking");
  assert.equal(wantsLunge("walk", 0, inside, false), false, "it does not lunge in the air");
  assert.equal(wantsLunge("windup", 0, inside, true), false, "it cannot start a second tell");
  assert.equal(wantsLunge("rest", 0, inside, true), false, "it is open after a lunge");
});

test("a hit cancels the tell or the lunge, and nothing else", () => {
  const half = ENEMY_AI.windupMs / 2;
  assert.equal(canInterrupt("windup", 0), true);
  assert.equal(canInterrupt("windup", half - 1), true);
  assert.equal(canInterrupt("windup", half), false, "the second half of the tell is armoured");
  assert.equal(canInterrupt("windup", ENEMY_AI.windupMs - 1), false, "striking the tell late is too late");
  assert.equal(canInterrupt("lunge", 0), false, "the commit has armour: swinging into it loses");
  assert.equal(canInterrupt("walk", 0), false);
  assert.equal(canInterrupt("rest", 0), false);
  assert.equal(modeRemainingMs("windup", 100), ENEMY_AI.windupMs - 100);
  assert.equal(modeRemainingMs("walk", 9999), 0);
});
