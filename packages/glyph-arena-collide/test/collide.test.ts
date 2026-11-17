import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { exportedNames } from "../../../scripts/lib/public-surface.mjs";
import { overlaps, type Aabb } from "../src/index.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function box(x: number, y: number, width: number, height: number): Aabb {
  return { x, y, width, height };
}

describe("overlaps", () => {
  it("returns true when boxes overlap", () => {
    assert.equal(overlaps(box(0, 0, 10, 10), box(5, 5, 10, 10)), true);
    assert.equal(overlaps(box(0, 0, 20, 20), box(1, 1, 5, 5)), true);
  });

  it("returns true when boxes touch on an edge", () => {
    assert.equal(overlaps(box(0, 0, 10, 10), box(10, 0, 10, 10)), true);
    assert.equal(overlaps(box(0, 0, 10, 10), box(0, 10, 10, 10)), true);
    assert.equal(overlaps(box(0, 0, 10, 10), box(10, 10, 10, 10)), true);
  });

  it("returns false when boxes are separate", () => {
    assert.equal(overlaps(box(0, 0, 10, 10), box(11, 0, 10, 10)), false);
    assert.equal(overlaps(box(0, 0, 10, 10), box(0, 11, 10, 10)), false);
    assert.equal(overlaps(box(0, 0, 10, 10), box(11, 11, 10, 10)), false);
  });

  it("returns false when width or height is zero or negative", () => {
    assert.equal(overlaps(box(0, 0, 0, 10), box(0, 0, 10, 10)), false);
    assert.equal(overlaps(box(0, 0, 10, 0), box(0, 0, 10, 10)), false);
    assert.equal(overlaps(box(0, 0, 10, 10), box(0, 0, -1, 10)), false);
    assert.equal(overlaps(box(0, 0, 10, 10), box(0, 0, 10, -5)), false);
  });

  it("returns false when any value is NaN", () => {
    assert.equal(overlaps(box(NaN, 0, 10, 10), box(0, 0, 10, 10)), false);
    assert.equal(overlaps(box(0, NaN, 10, 10), box(0, 0, 10, 10)), false);
    assert.equal(overlaps(box(0, 0, NaN, 10), box(0, 0, 10, 10)), false);
    assert.equal(overlaps(box(0, 0, 10, NaN), box(0, 0, 10, 10)), false);
    assert.equal(overlaps(box(0, 0, 10, 10), box(NaN, 0, 10, 10)), false);
  });

  it("returns false when any value is Infinity", () => {
    assert.equal(overlaps(box(Infinity, 0, 10, 10), box(0, 0, 10, 10)), false);
    assert.equal(overlaps(box(0, -Infinity, 10, 10), box(0, 0, 10, 10)), false);
    assert.equal(overlaps(box(0, 0, Infinity, 10), box(0, 0, 10, 10)), false);
    assert.equal(overlaps(box(0, 0, 10, 10), box(0, 0, 10, Infinity)), false);
  });

  it("does not mutate inputs", () => {
    const a = box(0, 0, 10, 10);
    const b = box(5, 5, 10, 10);
    const aCopy = { ...a };
    const bCopy = { ...b };

    overlaps(a, b);

    assert.deepEqual(a, aCopy);
    assert.deepEqual(b, bCopy);
  });

  it("exports only the names on its public list, and imports no sibling package", () => {
    const source = readFileSync(join(packageRoot, "src", "index.ts"), "utf8");

    // The surface, not the vocabulary: a new public name has to be added here on purpose,
    // and a word used inside a function is not a name. This is what used to be a list of
    // forbidden words, which turned `follow` into a reason a package could not grow.
    assert.deepEqual(exportedNames(source), [
      "Aabb",
      "overlaps",
    ]);

    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-/);
  });
});
