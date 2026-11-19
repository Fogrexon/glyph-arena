import assert from "node:assert/strict";
import { test } from "node:test";

import { ENEMY_AI, calledBy, stepToPost } from "../src/enemy.ts";
import { PLAYER_RUN_PX_PER_SECOND } from "../src/sizes.ts";

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

test("a guard you walked past can close the gap — and only slowly", () => {
  // The two halves of the same rule. **Slower than the player and passing is free**: measured on
  // 11-19, "run and never swing" cleared the road in 15.0 s against the careful line's 28.5 s, so
  // there was no choice to make. **Much faster and the road is a chase nobody survives.** The gap
  // is the design: he gains 30 px/s, so across one beat nothing happens and across a road you have
  // a decision to make.
  assert.ok(
    ENEMY_AI.chaseSpeedPxPerSecond > PLAYER_RUN_PX_PER_SECOND,
    `a guard who follows at ${ENEMY_AI.chaseSpeedPxPerSecond} px/s cannot catch a ${PLAYER_RUN_PX_PER_SECOND} px/s player: passing is free again`,
  );
  const closing = ENEMY_AI.chaseSpeedPxPerSecond - PLAYER_RUN_PX_PER_SECOND;
  assert.ok(
    closing <= PLAYER_RUN_PX_PER_SECOND * 0.2,
    `he closes at ${closing} px/s with one commit per pass — that is a chase, not a cost`,
  );
});

test("the guard you pass shouts ahead: the next post wakes, and his partner with him", () => {
  // The road, in posts — read from the level, not typed: 448 | 768 864 | 1216 1280 1344 | 1792 1856 |
  // 2240 2304 2368. Passing the first guard must wake the pair behind him and nothing else; a shout
  // that reached the whole road would be a difficulty dial rather than a price on one decision.
  const posts = [448, 768, 864, 1216, 1280, 1344, 1792, 1856, 2240, 2304, 2368];
  assert.deepEqual(calledBy(posts, 448, ENEMY_AI.callPartnerPx), [768, 864], "the pair behind the first guard");
  assert.deepEqual(calledBy(posts, 864, ENEMY_AI.callPartnerPx), [1216, 1280, 1344], "the triple after the pair");
  assert.deepEqual(calledBy(posts, 2368, ENEMY_AI.callPartnerPx), [], "the last guard has nobody ahead to call");
});

test("a called guard commits from past his own reach, so the body lands in the road", () => {
  // He is not aiming at where you stood: 190 px is further than the 138 px commit covers, so the
  // lunge ends short of your old position and across the line you are running down. That shortfall
  // is the whole point — a commit that reached you would be a hit, and a hit is not a choice.
  const commitPx = (ENEMY_AI.lungeSpeedPxPerSecond * ENEMY_AI.lungeMs) / 1000;
  assert.equal(Math.round(commitPx), 138);
  assert.ok(
    ENEMY_AI.alertRangePx > commitPx,
    `a called guard commits from ${ENEMY_AI.alertRangePx} px, inside his ${commitPx} px reach — that is a hit, not a road to get past`,
  );
  assert.ok(
    ENEMY_AI.alertRangePx - commitPx < ENEMY_AI.lungeRangePx,
    `a called guard stops ${ENEMY_AI.alertRangePx - commitPx} px short, which is further than the ${ENEMY_AI.lungeRangePx} px a guard normally holds — he would be lunging at nothing`,
  );
});
