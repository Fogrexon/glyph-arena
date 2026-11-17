import assert from "node:assert/strict";
import { test } from "node:test";

import { TILE, goalPoint, isHazardTile, isSolidTile, spawnPoint } from "../src/level.ts";
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
 * A player who runs right and jumps when the floor two tiles ahead is missing. If this cannot
 * finish the slice, the level is not playable and no amount of drawing will fix it.
 */
test("a simple bot can run the slice to the goal", () => {
  const spawn = spawnPoint();
  const goal = goalPoint();
  assert.ok(goal !== null, "no goal");
  const body = createBody(spawn.x + 6, spawn.y - 28, 20, 28);
  const dt = 1 / 60;
  let jumpHeldFrames = 0;
  let reached = false;

  for (let frame = 0; frame < 60 * 25; frame += 1) {
    const aheadColumn = Math.floor((body.x + body.w + 80) / TILE);
    const footRow = Math.floor((body.y + body.h + 2) / TILE);
    const floorAhead = isSolidTile(aheadColumn, footRow) || isSolidTile(aheadColumn, footRow + 1);
    const hazardAhead = isHazardTile(aheadColumn, footRow) || isHazardTile(aheadColumn, footRow - 1);
    const wantJump = body.grounded && (!floorAhead || hazardAhead);
    if (wantJump) {
      jumpHeldFrames = 18;
    }
    const jumpHeld = jumpHeldFrames > 0;
    jumpHeldFrames = Math.max(0, jumpHeldFrames - 1);
    stepBody(body, { left: false, right: true, jumpPressed: wantJump, jumpHeld }, dt, solid);
    if (hazard(body)) break;
    if (body.y > 13 * TILE + 240) break;
    if (body.x + body.w > goal.x) {
      reached = true;
      break;
    }
  }

  assert.ok(reached, `the bot stopped at x=${body.x.toFixed(0)} (goal x=${goal.x})`);
});
