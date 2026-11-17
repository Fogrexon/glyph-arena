import assert from "node:assert/strict";
import { test } from "node:test";

import { TILE, enemySpawns, levelColumns, spawnPoint } from "../src/level.ts";

test("the camp has a spawn, one enemy, and ground under the spawn", () => {
  const spawn = spawnPoint();
  assert.ok(levelColumns() > 20, "a camp you can cross");
  assert.equal(enemySpawns().length, 2, "the camp is two enemies: one beside you, one ahead");
  assert.equal(spawn.x % TILE, 0);
  assert.ok(spawn.x > 0, "spawn is not in the left wall");
  const xs = enemySpawns().map((p) => p.x);
  assert.ok(xs.every((x) => x > spawn.x + 10 * TILE), "both wait across the camp");
  assert.ok(Math.abs(xs[0] - xs[1]) >= 4 * TILE, "they are far enough apart to arrive one after the other");
});
