import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TILE,
  goalLineX,
  goalPoint,
  hazardWithin,
  isHazardTile,
  isSolidTile,
  levelColumns,
  levelCount,
  levelRows,
  chaseSightLane,
  chaseSpawnLane,
  loadLevel,
  patrolRange,
  spawnPoint,
  tileAt,
} from "../src/level.ts";

/** Every level, checked by the same rules: a level that breaks them is not a level. */
for (let index = 0; index < levelCount(); index += 1) {
  test(`level ${index + 1} has a spawn, a goal and something to die on`, () => {
    loadLevel(index);
    const spawn = spawnPoint();
    const goal = goalPoint();
    assert.ok(goal !== null, "no goal in the level");
    assert.ok(goal.x > spawn.x, "the goal has to be ahead of the spawn");
    assert.ok(goalLineX() > spawn.x, "the goal line has to be ahead of the spawn");
    assert.ok(goalLineX() <= levelColumns() * TILE, "the goal line is outside the level");
    let hazards = 0;
    for (let row = 0; row < levelRows(); row += 1) {
      for (let column = 0; column < levelColumns(); column += 1) {
        if (isHazardTile(column, row)) hazards += 1;
      }
    }
    assert.ok(hazards > 0, "a level needs something that kills");
  });

  test(`level ${index + 1}: the spawn stands on solid ground, not in the air`, () => {
    loadLevel(index);
    const spawn = spawnPoint();
    const column = Math.floor(spawn.x / TILE);
    const row = Math.floor(spawn.y / TILE);
    assert.ok(isSolidTile(column, row + 1), "nothing under the spawn");
    assert.equal(tileAt(column, row), "spawn");
  });

  test(`level ${index + 1} is wide enough to be a run, not a room`, () => {
    loadLevel(index);
    assert.ok(levelColumns() * TILE > 1200, `only ${levelColumns() * TILE} px wide`);
  });

  test(`level ${index + 1}: outside the level is sky, not a wall`, () => {
    loadLevel(index);
    assert.equal(tileAt(-3, 0), "empty");
    assert.equal(tileAt(0, -2), "empty");
    assert.equal(tileAt(levelColumns() + 5, 2), "empty");
  });
}

test("level 2 asks for height: a step up onto a plateau, and a pit to cross", () => {
  loadLevel(1);
  // The step: a solid tile one row above the ground the runner walks on, somewhere mid-level.
  const groundRow = 11;
  let stepColumn = -1;
  for (let column = 1; column < levelColumns(); column += 1) {
    if (isSolidTile(column, groundRow - 1) && !isSolidTile(column - 1, groundRow - 1)) {
      stepColumn = column;
      break;
    }
  }
  assert.ok(stepColumn > 0, "no step up: level 2 would just be level 1 again");

  let pit = 0;
  for (let column = 0; column < levelColumns(); column += 1) {
    if (!isSolidTile(column, groundRow) && !isSolidTile(column, groundRow + 1)) pit += 1;
  }
  assert.ok(pit >= 2, `no pit to cross (${pit} empty columns)`);
});

test("level 1 does not ask for height (that is what makes level 2 a step)", () => {
  loadLevel(0);
  let steps = 0;
  for (let column = 1; column < levelColumns(); column += 1) {
    if (isSolidTile(column, 10) && !isSolidTile(column - 1, 10)) steps += 1;
  }
  // A ledge hanging in the sky is not a step: it has to be reachable from the ground line.
  assert.equal(steps, 0, `level 1 grew ${steps} step(s) at row 10`);
});

test("an unknown level is refused, not drawn as sky", () => {
  assert.throws(() => loadLevel(levelCount()), RangeError);
  assert.throws(() => loadLevel(-1), RangeError);
});

test("level 3 keeps one straight of at least 180 px, and its walker comes at you", () => {
  loadLevel(2);
  // The straight is what R10b measures pursuit over, so it is a level rule, not a coincidence:
  // walk the ground line and take the longest run of floor with nothing above it.
  // The runnable line is the topmost solid tile in each column, so a plateau counts as floor too.
  const surfaceRow = (column: number): number => {
    for (let row = 0; row < levelRows(); row += 1) {
      if (isSolidTile(column, row)) return row;
    }
    return -1;
  };
  let longest = 0;
  let run = 0;
  for (let column = 0; column < levelColumns(); column += 1) {
    const surface = surfaceRow(column);
    const floor = surface >= 0;
    const clearAbove = floor && !isHazardTile(column, surface - 1) && !isHazardTile(column, surface - 2);
    if (floor && clearAbove) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }
  assert.ok(longest * TILE >= 180, `the longest straight is ${longest * TILE} px, under the 180 px R10b needs`);

  // The straight the spec measures pursuit over is a named lane, and every column of it has to be
  // runnable with nothing above the floor — otherwise R10b measures a jump, not a pursuit.
  const lane = chaseSightLane();
  assert.ok(lane !== null, "level 3 has no pursuit-measurement lane");
  assert.ok(lane.endX - lane.startX >= 180, `the lane is only ${lane.endX - lane.startX} px`);
  for (let x = lane.startX; x < lane.endX; x += TILE) {
    const column = Math.floor(x / TILE);
    const surface = surfaceRow(column);
    assert.ok(surface >= 0, `the lane has no floor at column ${column}`);
    assert.ok(
      !isHazardTile(column, surface - 1) && !isHazardTile(column, surface - 2) && !isSolidTile(column, surface - 1),
      `something is in the lane at column ${column}: R10b would measure an obstacle, not a pursuit`,
    );
  }

  const patrol = patrolRange();
  assert.ok(patrol !== null, "level 3 has no walker");
  assert.equal(patrol.dir, -1, "level 3's walker has to walk back at the runner, not away from them");
  assert.ok(patrol.minX > 0 && patrol.maxX > patrol.minX, "the walker's lane is empty");
});

test("level 3 keeps the pursuit enemy's columns flat and clear", () => {
  loadLevel(2);
  const lane = chaseSpawnLane();
  assert.ok(lane !== null, "level 3 has no lane for the pursuit enemy");
  for (let x = lane.startX; x < lane.endX; x += TILE) {
    const column = Math.floor(x / TILE);
    let surface = -1;
    for (let row = 0; row < levelRows(); row += 1) {
      if (isSolidTile(column, row)) {
        surface = row;
        break;
      }
    }
    assert.ok(surface >= 0, `the pursuit lane has no floor at column ${column}`);
    // The enemy stands one tile above the floor: a step or a spike here is a wall for it, and the
    // enemy would start inside the terrain instead of on it.
    assert.ok(
      !isSolidTile(column, surface - 1) && !isHazardTile(column, surface - 1) && !isHazardTile(column, surface - 2),
      `the pursuit lane is blocked at column ${column}: the enemy would start inside the level`,
    );
  }
});

test("a respawn point needs 96 px of clear ground (the safe rule, no browser)", () => {
  // The first hazard in the current level, whatever that level happens to be: the rule is about
  // distance, so the test must not be tied to the column a level uses today.
  let hazardColumn = -1;
  let hazardRow = -1;
  for (let row = 0; row < levelRows() && hazardColumn < 0; row += 1) {
    for (let column = 0; column < levelColumns(); column += 1) {
      if (isHazardTile(column, row)) {
        hazardColumn = column;
        hazardRow = row;
        break;
      }
    }
  }
  assert.ok(hazardColumn >= 0, "the level has no hazard to be clear of");

  const y = hazardRow * TILE;
  const clear = hazardColumn * TILE - 96 - 20; // the body's right edge ends 96 px before the hazard
  assert.equal(hazardWithin(clear, y, 20, 28, 96), false, "96 px of clear ground was rejected");
  assert.equal(hazardWithin(clear + 32, y, 20, 28, 96), true, "64 px of clear ground passed the rule");
});
