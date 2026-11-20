import assert from "node:assert/strict";
import { test } from "node:test";

import { ENEMY_SIZE, PLAYER_RUN_PX_PER_SECOND } from "../src/sizes.ts";
import { RUNNING_CAUSE_VX, causeOf, controlsLines, edgeMarkFor, hitsLine } from "../src/readout.ts";

/**
 * The HUD said `hits 4 (4 from behind)` next to every death on 11-19. Nothing measured a side: the
 * cause was `player.vx > 60`, "were you running at the goal", and two first-time players plus the
 * person who wrote it all reported it as "the guard hit me from behind" — while the same run had
 * `passed 0/11`, so every guard was in front of them. The tests below pin the label to the number
 * it comes from, so the next reader cannot be handed a fact the run never produced.
 */

test("the cause is which way the body was going, and nothing else", () => {
  assert.equal(causeOf(0), "standing", "a body at rest is standing");
  assert.equal(causeOf(-PLAYER_RUN_PX_PER_SECOND), "standing", "moving away from the goal is not running at it");
  assert.equal(causeOf(PLAYER_RUN_PX_PER_SECOND), "running", "the road's walking speed is running");
});

test("the threshold sits between standing and walking", () => {
  // Not taste: it has to be above 0 (a stopped body is standing) and under the walking speed (a
  // walking body is running at the goal). Both ends come from the game's own constant.
  assert.ok(RUNNING_CAUSE_VX > 0, `a threshold of ${RUNNING_CAUSE_VX} would count a stopped body as running`);
  assert.ok(
    RUNNING_CAUSE_VX < PLAYER_RUN_PX_PER_SECOND,
    `the threshold ${RUNNING_CAUSE_VX} is not under the ${PLAYER_RUN_PX_PER_SECOND} px/s walk, so walking would read as standing`,
  );
  assert.equal(causeOf(RUNNING_CAUSE_VX), "standing", "the boundary stays on the standing side");
  assert.equal(causeOf(RUNNING_CAUSE_VX + 1), "running");
});

test("the death line names what was measured and never a side", () => {
  const line = hitsLine(4, 4);
  assert.equal(line, "hits 4 (4 while running)");
  assert.doesNotMatch(line, /behind/i, "nothing in the run measures which side a guard was on");
  assert.equal(hitsLine(0, 0), "hits 0 (0 while running)", "a clean run still prints the number");
  // And the two numbers can disagree, which is the whole point of printing both.
  assert.equal(hitsLine(3, 0), "hits 3 (0 while running)");
});

test("the controls line teaches the one verb three first-time players never found", () => {
  const [keys, verb] = controlsLines({ kills: 0, passes: 0 });
  // 11-19: 宣伝, QA and リリース all finished their minute at `passed 0/11`. The old single line
  // listed `Shift roll` beside `J attack`, which reads as two ways to do the same thing; rolling is
  // the only thing in the game that crosses a body, and the line never said so.
  assert.match(keys, /Shift roll/, "the key itself has to stay on the line a player scans");
  assert.match(verb, /roll/i);
  assert.match(verb, /through a body/i, "the line has to say what the roll does that walking does not");
  assert.match(verb, /wakes the next one/i, "and what it costs");
  // Every row has to fit the view: 12 px monospace is ~7.2 px a character on the 640 px canvas.
  for (const line of controlsLines({ kills: 0, passes: 0 })) {
    assert.ok(line.length <= 84, `"${line}" is ${line.length} chars, past the 640 px view at 12 px`);
  }
});

test("the tell is taught until it is learned, and then it leaves", () => {
  // Two of the three first-time players (11-19) died to lunges they never interrupted. The tell is
  // 260 ms of orange and hitting him inside it cancels the lunge outright — the fight's whole
  // defence, and it was on no screen. It shows while the player has not yet killed or passed
  // anybody, and leaves after the first of either: a hint that never leaves is scenery.
  const fresh = controlsLines({ kills: 0, passes: 0 });
  assert.equal(fresh.length, 3, "a player who has done neither gets all three rows");
  assert.match(fresh[2], /tell/i);
  assert.match(fresh[2], /hit him inside it/i);
  assert.match(fresh[2], /lunge never happens/i, "the line has to say what striking the tell buys");

  assert.equal(controlsLines({ kills: 1, passes: 0 }).length, 2, "one kill and the lesson is over");
  assert.equal(controlsLines({ kills: 0, passes: 1 }).length, 2, "one pass counts the same");
  assert.equal(controlsLines({ kills: 3, passes: 2 }).length, 2);
});

test("a guard on screen keeps his mark on his body", () => {
  assert.equal(edgeMarkFor(200, ENEMY_SIZE.w, 200, ENEMY_SIZE.h, 640), null, "a body inside the view needs no edge cue");
  assert.equal(edgeMarkFor(0, ENEMY_SIZE.w, 200, ENEMY_SIZE.h, 640), null, "touching the left edge is still on screen");
  assert.equal(edgeMarkFor(620, ENEMY_SIZE.w, 200, ENEMY_SIZE.h, 640), null, "touching the right edge is still on screen");
});

test("a woken guard off screen gets a mark on the edge he is off of", () => {
  // QA's exact measurement (11-19): standing at x 406, the pair woken at 774 and 870 is 368 and
  // 464 px to the right, which on the 640 px view with the player at 42% is 637 px and 733 px.
  const right = edgeMarkFor(637, ENEMY_SIZE.w, 200, ENEMY_SIZE.h, 640);
  assert.ok(right !== null, `637 + ${ENEMY_SIZE.w} overflows a 640 px view, so the body is not on screen`);
  assert.ok(right.x >= 0 && right.x + right.w <= 640, `the mark at ${right.x} is off the view itself`);
  assert.ok(right.x > 640 - 16, "the mark belongs on the right edge, where the body went");
  assert.equal(right.y, 200 + (ENEMY_SIZE.h - Math.min(ENEMY_SIZE.h, 24)) / 2, "the mark is centred on the body it stands for");

  const far = edgeMarkFor(733, ENEMY_SIZE.w, 200, ENEMY_SIZE.h, 640);
  assert.ok(far !== null && far.x > 640 - 16, "733 px is past the view and still marks the right edge");

  const left = edgeMarkFor(-40, ENEMY_SIZE.w, 200, ENEMY_SIZE.h, 640);
  assert.ok(left !== null, "a body behind the camera is off screen too");
  assert.ok(left.x < 16, "and its mark belongs on the left edge");
});

test("the edge mark is a bar, not a second body", () => {
  const mark = edgeMarkFor(700, ENEMY_SIZE.w, 200, ENEMY_SIZE.h, 640);
  assert.ok(mark !== null);
  assert.equal(mark.w, 4, "4 px wide: a bar at the edge, so it cannot read as a guard standing there");
  assert.ok(mark.h <= 24 && mark.h <= ENEMY_SIZE.h, "never taller than the body it stands for");
  // A short body still gets a proportionate bar rather than a bar taller than the guard.
  const short = edgeMarkFor(700, ENEMY_SIZE.w, 200, 10, 640);
  assert.ok(short !== null && short.h === 10);
});
