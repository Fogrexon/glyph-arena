import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TILE,
  goalLineX,
  goalPoint,
  isHazardTile,
  isSolidTile,
  levelColumns,
  levelCount,
  levelRows,
  loadLevel,
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
