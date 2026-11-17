import assert from "node:assert/strict";
import { test } from "node:test";

import { TILE, enemySpawns, levelColumns, spawnPoint } from "../src/level.ts";

test("the camp has a spawn, one enemy, and ground under the spawn", () => {
  const spawn = spawnPoint();
  assert.ok(levelColumns() > 20, "a camp you can cross");
  assert.equal(enemySpawns().length, 1, "slice one is one enemy");
  assert.equal(spawn.x % TILE, 0);
  assert.ok(spawn.x > 0, "spawn is not in the left wall");
  assert.ok((enemySpawns()[0]?.x ?? 0) > spawn.x + 10 * TILE, "the enemy stands past the rocks, not beside you");
});
