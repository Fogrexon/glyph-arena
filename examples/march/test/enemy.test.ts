import assert from "node:assert/strict";
import { test } from "node:test";

import { ENEMY_AI, stepToPost } from "../src/enemy.ts";

const STEP_MS = 1000 / 60;

test("a guard who is off his post walks back to it, at the speed the game declares", () => {
  // The commit moves the body 138 px; nothing used to move it back. Measured on 11-19, holding right
  // at the first guard carried the post 454 → 329 → 204 → 79 and killed the walker at the spawn wall
  // in 4.2 s. This is the arithmetic that undoes it.
  const homeX = 454;
  const lungedX = homeX - ENEMY_AI.lungeMs * (ENEMY_AI.lungeSpeedPxPerSecond / 1000);
  assert.equal(Math.round(lungedX), 316, "the commit covers 138 px, which is the ground to cover back");

  const dt = STEP_MS / 1000;
  let x = lungedX;
  let frames = 0;
  while (x !== homeX && frames < 600) {
    const next = stepToPost(x, homeX, ENEMY_AI.returnPxPerSecond, dt);
    assert.ok(next >= x, `frame ${frames} walked the wrong way: ${x} → ${next}`);
    assert.ok(next <= homeX, `frame ${frames} overshot the post: ${x} → ${next}`);
    assert.ok(next - x <= ENEMY_AI.returnPxPerSecond * dt + 1e-9, `frame ${frames} moved ${next - x} px in one frame`);
    x = next;
    frames += 1;
  }
  assert.equal(x, homeX, "the guard never arrived at his post");
  // 138 px at 300 px/s is 460 ms — the walk home is a beat, not a teleport, and it fits inside the
  // 450 ms of rest plus a few frames of walking.
  assert.ok(frames >= 25 && frames <= 32, `the walk home took ${frames} frames (${Math.round(frames * STEP_MS)} ms)`);
});

test("the post is reached exactly, from either side", () => {
  const dt = STEP_MS / 1000;
  assert.equal(stepToPost(316.4, 316, ENEMY_AI.returnPxPerSecond, dt), 316, "a guard 0.4 px short stays short");
  assert.equal(stepToPost(315.6, 316, ENEMY_AI.returnPxPerSecond, dt), 316, "a guard past his post comes back");
  assert.equal(stepToPost(316, 316, ENEMY_AI.returnPxPerSecond, dt), 316, "a guard on his post stands on it");
  // A long frame (a tab that was asleep) must not teleport him past the post or through the road.
  assert.equal(stepToPost(316, 454, ENEMY_AI.returnPxPerSecond, 0.25), 391, "a 250 ms frame is one long step, not a jump");
});
