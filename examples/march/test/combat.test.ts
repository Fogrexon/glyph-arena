import assert from "node:assert/strict";
import { test } from "node:test";

import { ATTACK, attackBox, overlapsHalfOpen } from "../src/combat.ts";
import { ENEMY_AI } from "../src/enemy.ts";
import { ENEMY_SIZE, PLAYER_SIZE } from "../src/sizes.ts";

/** The gap between the two bodies at the moment a guard starts his tell — derived, not written. */
const LINE_GAP_PX = ENEMY_AI.lungeRangePx - (PLAYER_SIZE.w + ENEMY_SIZE.w) / 2;

function guardAt(player, gapPx, side) {
  const left = side === 1 ? player.x + player.w + gapPx : player.x - gapPx - ENEMY_SIZE.w;
  return { left, top: player.y, right: left + ENEMY_SIZE.w, bottom: player.y + ENEMY_SIZE.h };
}

test("a swing from the line a guard commits from actually reaches him", () => {
  // The whole point of the tell: it announces the commit 260 ms early so that "strike it early,
  // which cancels the lunge" is a thing your hands can do from where you are standing. At the
  // shipped reach of 30 px it was not — a first-time player (QA, 11-19) swung three times at that
  // line, saw `blade: active`, and the guard's hp never moved. The number is derived from the two
  // body widths and the lunge range, so moving the trigger or the bodies re-opens this question
  // instead of silently reintroducing the invisible rule.
  const player = { x: 100, y: 0, w: PLAYER_SIZE.w, h: PLAYER_SIZE.h };
  for (const side of [1, -1]) {
    const guard = guardAt(player, LINE_GAP_PX, side);
    assert.ok(
      overlapsHalfOpen(attackBox(player, side), guard),
      `a swing at the ${LINE_GAP_PX} px line misses (reach ${ATTACK.reachPx} px, facing ${side})`,
    );
  }
});

test("the blade still has an end: one pixel past the reach is a miss", () => {
  // The other half of the same rule. A reach that grew without a bound would turn the fight into
  // "press J from anywhere", which is the failure this game was built to avoid — the fixed 138 px
  // commit and the 300 px roll only mean something if the answer has a shape too.
  const player = { x: 100, y: 0, w: PLAYER_SIZE.w, h: PLAYER_SIZE.h };
  for (const side of [1, -1]) {
    const guard = guardAt(player, ATTACK.reachPx + 1, side);
    assert.equal(
      overlapsHalfOpen(attackBox(player, side), guard),
      false,
      `the blade reaches ${ATTACK.reachPx + 1} px (facing ${side}); the reach is not a reach, it is a ray`,
    );
  }
});

test("the blade starts at the shoulder, not at the model's edge", () => {
  // `attackBox` is read by the game, the hit test and the renderer; a box that began at the body's
  // edge would draw the swing a body-width too far forward and land hits the picture does not show.
  const player = { x: 100, y: 0, w: PLAYER_SIZE.w, h: PLAYER_SIZE.h };
  const right = attackBox(player, 1);
  const left = attackBox(player, -1);
  assert.equal(right.left, player.x + player.w - 4);
  assert.equal(right.right, player.x + player.w + ATTACK.reachPx);
  assert.equal(left.left, player.x - ATTACK.reachPx);
  assert.equal(left.right, player.x + 4);
});
