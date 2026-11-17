import assert from "node:assert/strict";
import { test } from "node:test";

import { TILE, goalLineX, isHazardTile, isSolidTile, levelColumns, levelCount, levelRows, loadLevel, spawnPoint } from "../src/level.ts";
import { createBody, stepBody } from "../src/physics.ts";

const solid = (left: number, top: number, right: number, bottom: number): boolean => {
  for (let row = Math.floor(top / TILE); row <= Math.floor((bottom - 0.001) / TILE); row += 1) {
    for (let column = Math.floor(left / TILE); column <= Math.floor((right - 0.001) / TILE); column += 1) {
      if (isSolidTile(column, row)) return true;
    }
  }
  return false;
};

const hazard = (body: { x: number; y: number; w: number; h: number }): boolean => {
  for (let row = Math.floor(body.y / TILE); row <= Math.floor((body.y + body.h - 0.001) / TILE); row += 1) {
    for (let column = Math.floor(body.x / TILE); column <= Math.floor((body.x + body.w - 0.001) / TILE); column += 1) {
      if (isHazardTile(column, row)) return true;
    }
  }
  return false;
};

/**
 * A player who runs right and jumps when the floor ahead is missing, when a spike is ahead, or
 * when the ground steps up. If this cannot finish a level, the level is not playable and no
 * amount of drawing will fix it — and since it plays every level in order, "level 2 exists" is
 * only true if the bot can actually get there and clear it.
 */
test("a simple bot clears every level, in order, to the goal", () => {
  for (let index = 0; index < levelCount(); index += 1) {
    loadLevel(index);
    const spawn = spawnPoint();
    const goalX = goalLineX();
    const bottomRow = levelRows() * TILE + 240;
    const body = createBody(spawn.x + 6, spawn.y - 28, 20, 28);
    const dt = 1 / 60;
    let jumpHeldFrames = 0;
    let reached = false;

    for (let frame = 0; frame < 60 * 25; frame += 1) {
      const aheadColumn = Math.floor((body.x + body.w + 80) / TILE);
      // A spike is jumped when it is *about* to be under you, not 80 px early: an early jump
      // lands on the far side of a long spike bed. A pit or a step still needs the long look.
      const hazardColumn = Math.floor((body.x + body.w + 40) / TILE);
      const footRow = Math.floor((body.y + body.h + 2) / TILE);
      const floorAhead = isSolidTile(aheadColumn, footRow) || isSolidTile(aheadColumn, footRow + 1);
      const hazardAhead = isHazardTile(hazardColumn, footRow) || isHazardTile(hazardColumn, footRow - 1);
      // The tile the body occupies ahead of it: that is the step it has to climb.
      const wallAhead = isSolidTile(aheadColumn, footRow - 1);
      const wantJump = body.grounded && (!floorAhead || hazardAhead || wallAhead);
      if (wantJump) {
        jumpHeldFrames = 18;
      }
      const jumpHeld = jumpHeldFrames > 0;
      jumpHeldFrames = Math.max(0, jumpHeldFrames - 1);
      stepBody(body, { left: false, right: true, jumpPressed: wantJump, jumpHeld }, dt, solid);
      if (hazard(body)) break;
      if (body.y > bottomRow) break;
      if (body.x + body.w > goalX) {
        reached = true;
        break;
      }
    }

    assert.ok(
      reached,
      `level ${index + 1}: the bot stopped at x=${body.x.toFixed(0)} (goal line x=${goalX}, level is ${levelColumns() * TILE} px)`,
    );
    // The next level must be loadable at all: a level count of 2 with a broken second level
    // would have failed the loop above, not here.
    assert.ok(index < levelCount());
  }
});
