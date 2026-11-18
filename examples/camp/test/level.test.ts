import assert from "node:assert/strict";
import { test } from "node:test";

import { TILE, enemySpawns, levelColumns, spawnPoint } from "../src/level.ts";

test("the camp is two pairs of enemies, one pair per camp", () => {
  const spawn = spawnPoint();
  assert.ok(levelColumns() > 20, "a camp you can cross");
  assert.equal(spawn.x % TILE, 0);
  assert.ok(spawn.x > 0, "spawn is not in the left wall");

  // Derived from the level, not from indices: the shape is "a pair, a walk, a pair", and where the
  // pairs sit is the level's business. Hard-coding "the first two" would pass for a level that put
  // them in the wrong order.
  const xs = enemySpawns()
    .map((point) => point.x)
    .sort((a, b) => a - b);
  assert.equal(xs.length, 4, "two camps of two");
  assert.ok(xs.every((x) => x > spawn.x + 8 * TILE), "nobody waits on the doorstep");

  const gaps = xs.slice(1).map((x, index) => x - xs[index]);
  const together = gaps.filter((gap) => gap <= 6 * TILE);
  const walks = gaps.filter((gap) => gap > 6 * TILE);
  assert.equal(together.length, 2, "each camp's two arrive together");
  assert.equal(walks.length, 1, "one walk between the two camps");
  assert.ok(walks[0] >= 10 * TILE, "the walk is long enough to reset before the second camp");
});
