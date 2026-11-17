import assert from "node:assert/strict";
import { test } from "node:test";

import { ATTACK, attackBox, attackPhase, beginAttack, overlaps, stepAttack } from "../src/combat.ts";

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
