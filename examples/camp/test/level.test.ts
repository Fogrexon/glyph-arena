import assert from "node:assert/strict";
import { test } from "node:test";

import { TILE, enemySpawns, isSolidTile, levelColumns, spawnPoint } from "../src/level.ts";

test("the camp is a pair, a walk, then a bigger room", () => {
  const spawn = spawnPoint();
  assert.ok(levelColumns() > 20, "a camp you can cross");
  assert.equal(spawn.x % TILE, 0);
  assert.ok(spawn.x > 0, "spawn is not in the left wall");

  // Derived from the level, not from indices: split the spawns wherever the walk is. "the first
  // two" would pass for a level that put them in the wrong order, and a written-down count is a
  // test that has to be edited whenever the level moves.
  const xs = enemySpawns()
    .map((point) => point.x)
    .sort((a, b) => a - b);
  assert.ok(xs.every((x) => x > spawn.x + 8 * TILE), "nobody waits on the doorstep");

  const gaps = xs.slice(1).map((x, index) => x - xs[index]);
  const camps: number[][] = [[]];
  xs.forEach((x, index) => {
    if (index > 0 && gaps[index - 1] > 6 * TILE) camps.push([]);
    camps[camps.length - 1].push(x);
  });

  assert.equal(camps.length, 2, "two fights, one walk between them");
  assert.ok(
    gaps.some((gap) => gap > 6 * TILE && gap >= 10 * TILE),
    "the walk is long enough to reset before the second camp",
  );
  assert.equal(camps[0].length, 2, "the first fight is a pair — the thing you meet");
  assert.equal(camps[1].length, camps[0].length + 1, "the smaller room holds one more body");
});

test("the world is closed on its left edge", () => {
  // The tilemap treats cells outside the map as empty, so a knockback at the first camp used to put
  // the player past the left edge (measured: x -104), where nothing can be fought and no run ends.
  // The wall is the level's job, so the level's test is where it is held.
  const spawn = spawnPoint();
  const row = spawn.y / TILE;
  assert.equal(isSolidTile(0, row), true, "a body cannot walk out of the world on the left");
  assert.equal(isSolidTile(0, row + 1), true, "and it cannot be knocked out under it either");
});
