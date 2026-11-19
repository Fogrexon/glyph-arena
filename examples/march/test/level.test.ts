import assert from "node:assert/strict";
import { test } from "node:test";

import { ENEMY_SIZE, PLAYER_SIZE } from "../src/sizes.ts";
import {
  TILE,
  enemySpawns,
  goalX,
  isSolidTile,
  levelColumns,
  levelRows,
  spawnPoint,
} from "../src/level.ts";

const standingRow = (): number => spawnPoint().y / TILE;

test("the world is closed on both edges, on every row", () => {
  // The tilemap treats cells outside the map as empty, so an open edge is a hole you can be knocked
  // through or walk off — the tutorial, the runner, the pickup and CAMP each closed it, and the
  // bug was invisible until someone pressed into the edge for four seconds. Every row, not just
  // the standing one: a jump takes the body to a different row.
  const columns = levelColumns();
  for (let row = 0; row < levelRows(); row += 1) {
    assert.equal(isSolidTile(0, row), true, `row ${row} is open on the left edge`);
    assert.equal(isSolidTile(columns - 1, row), true, `row ${row} is open on the right edge`);
  }
});

test("the road is clear from the spawn to the goal", () => {
  // A wall on the standing row would end the run without saying so. This is the level's promise:
  // you can walk the whole road, so every stop on it is a choice rather than an obstacle.
  const spawn = spawnPoint();
  const row = spawn.y / TILE;
  const blocked: number[] = [];
  for (let column = Math.floor(spawn.x / TILE); column <= Math.floor(goalX() / TILE); column += 1) {
    if (isSolidTile(column, row)) blocked.push(column);
  }
  assert.deepEqual(blocked, [], `column(s) ${blocked.join(", ")} stand in the road`);
});

test("every enemy stands on ground, and none of them stands in it", () => {
  const row = standingRow();
  for (const point of enemySpawns()) {
    const column = point.x / TILE;
    assert.equal(point.y / TILE, row, `an enemy at column ${column} stands on row ${point.y / TILE}`);
    assert.equal(isSolidTile(column, row + 1), true, `the enemy at column ${column} has no floor`);
    assert.equal(isSolidTile(column, row), false, `the enemy at column ${column} is inside ground`);
  }
});

test("the public goal is past the last enemy", () => {
  // Reaching the goal ends the run, so a goal behind a body would end it in the middle of a fight
  // and leave the rest of the road unplayed.
  const last = Math.max(...enemySpawns().map((point) => point.x));
  assert.ok(goalX() > last + 4 * TILE, `goal at ${goalX()} is not clear of the last enemy at ${last}`);
});

test("the road is a run of beats, each one answerable", () => {
  // The design rule, derived from the layout rather than written down as a count: groups are the
  // places where the gap between neighbours is not a walk. A group of one asks "fight or go by";
  // a group of three asks it with nowhere to stand, which the commit queue makes answerable. A
  // group of four does not — the queue spaces the commits, but there is no room left to be in.
  const xs = enemySpawns().map((point) => point.x);
  assert.ok(xs.length >= 8, `a one-minute road needs enough beats: ${xs.length}`);

  const gaps = xs.slice(1).map((x, index) => x - xs[index]);
  const walkPx = 6 * TILE;
  const groups: number[] = [1];
  gaps.forEach((gap) => {
    if (gap > walkPx) groups.push(1);
    else groups[groups.length - 1] += 1;
  });

  assert.ok(groups.length >= 5, `the decision has to repeat: ${groups.length} beat(s)`);
  for (const size of groups) {
    assert.ok(size <= 3, `a beat of ${size} has no room left to stand in (${groups.join("/")})`);
  }
  assert.ok(
    gaps.some((gap, index) => gaps[index + 1] !== undefined && gap > walkPx),
    "there is a walk between beats to reset before the next question",
  );
});

test("under the roof, a guard cannot be jumped over", () => {
  // The roof is a rule, so it is asserted like one. Walk up from each guard until the rock starts:
  // that is the ceiling, and the corridor is the floor minus it. A body can rise by the corridor
  // less its own height; a guard is cleared only if that rise beats its height. Measured on the
  // unroofed road, a 28 px body clears a guard at the top of a 111 px jump — the roof is what turns
  // "go by" from a free jump into a roll with a window.
  const row = standingRow();
  const floorPx = (row + 1) * TILE;
  for (const point of enemySpawns()) {
    const column = point.x / TILE;
    let ceilingRow = row - 1;
    while (ceilingRow >= 0 && !isSolidTile(column, ceilingRow)) ceilingRow -= 1;
    assert.ok(ceilingRow >= 0, `the guard at column ${column} stands under open sky`);
    const corridorPx = floorPx - (ceilingRow + 1) * TILE;
    assert.ok(corridorPx >= PLAYER_SIZE.h, `column ${column}: a ${PLAYER_SIZE.h} px body does not fit in ${corridorPx} px`);
    const risePx = corridorPx - PLAYER_SIZE.h;
    assert.ok(
      risePx < ENEMY_SIZE.h,
      `column ${column}: a ${risePx} px rise clears the ${ENEMY_SIZE.h} px guard — the roof is too high`,
    );
  }
});

test("nobody waits on the doorstep", () => {
  const spawn = spawnPoint();
  const first = Math.min(...enemySpawns().map((point) => point.x));
  assert.ok(first > spawn.x + 8 * TILE, "the first enemy is far enough to be seen coming");
});
