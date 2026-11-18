import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cellsWithTag,
  createTileMap,
  hasTag,
  mapColumns,
  mapRows,
  solidInRect,
  surfaceRowBelow,
  tagIn,
  tagsAt,
  tileAt,
  visibleColumns,
} from "../src/index.js";
import type { TileMapConfig } from "../src/index.js";

/** The game owns the words and the size; the package owns none of them. */
const CONFIG: TileMapConfig = {
  legend: {
    "#": ["solid"],
    "^": ["hazard"],
    "*": ["solid", "hazard"],
  },
  cell: 32,
};

/** 12 × 3. Row 2 is a floor; `*` is a tile that is both solid and a hazard. */
const TEXT = ["#..........#", "#..........#", "############"].join("\n");

const map = createTileMap(TEXT, CONFIG);

describe("createTileMap / mapColumns / mapRows", () => {
  it("takes the width from the longest row, so a short row does not shrink the world", () => {
    const ragged = createTileMap(["###", "#", "#####"], CONFIG);

    assert.equal(mapColumns(ragged), 5);
    assert.equal(mapRows(ragged), 3);
    assert.equal(tileAt(ragged, 4, 1), undefined);
  });

  it("accepts a string or lines, and drops the empty row a trailing newline would make", () => {
    assert.deepEqual(createTileMap("a\nb\n", CONFIG).lines, ["a", "b"]);
    assert.deepEqual(createTileMap(["a", "b"], CONFIG).lines, ["a", "b"]);
  });
});

describe("tileAt / tagsAt / hasTag", () => {
  it("answers outside the map instead of throwing", () => {
    // The runner asks about the world edge every frame; the old code threw or wrapped here.
    assert.equal(tileAt(map, -3, 0), undefined);
    assert.equal(tileAt(map, mapColumns(map) + 5, 2), undefined);
    assert.equal(tileAt(map, 0, -1), undefined);
    assert.equal(hasTag(map, -3, 0, "solid"), false);
    assert.equal(hasTag(map, mapColumns(map) + 5, 2, "solid"), false);
  });

  it("treats a tile's tags as a set, so one tile can answer for two", () => {
    const both = createTileMap("*", CONFIG);

    assert.equal(hasTag(both, 0, 0, "solid"), true);
    assert.equal(hasTag(both, 0, 0, "hazard"), true);
    assert.deepEqual([...tagsAt(both, 0, 0)], ["solid", "hazard"]);
    // The check that broke: `tile === "solid"` would answer false here.
    assert.notEqual(tileAt(both, 0, 0), "solid");
  });

  it("gives an unknown character no tags", () => {
    const unknown = createTileMap("?", CONFIG);

    assert.deepEqual([...tagsAt(unknown, 0, 0)], []);
    assert.equal(hasTag(unknown, 0, 0, "solid"), false);
  });
});

describe("cellsWithTag", () => {
  /** The game's word for a spawn; the package has none of its own. */
  const AT: TileMapConfig = { legend: { "@": ["at"] }, cell: 32 };

  it("returns every matching cell in reading order, so the first one is the top-left one", () => {
    const cells = cellsWithTag(createTileMap(["..@", "@..", "..."], AT), "at");

    assert.deepEqual(cells, [
      { column: 2, row: 0 },
      { column: 0, row: 1 },
    ]);
    // The order is part of the contract: a run starts at the first `@` in the text, so the
    // "where does this start" question is `[0]` and needs no second function.
    assert.deepEqual(cellsWithTag(createTileMap(["..@", "@..", "..."], AT), "at")[0], {
      column: 2,
      row: 0,
    });
  });

  it("answers cells, not pixels: the cell size never leaks into the result", () => {
    const small = cellsWithTag(createTileMap(["^^"], { ...CONFIG, cell: 1 }), "hazard");
    const large = cellsWithTag(createTileMap(["^^"], { ...CONFIG, cell: 32 }), "hazard");

    assert.deepEqual(small, large);
    assert.deepEqual(small, [
      { column: 0, row: 0 },
      { column: 1, row: 0 },
    ]);
  });

  it("finds a cell once per tag, including a cell that carries two", () => {
    const both = createTileMap("*", CONFIG);

    assert.deepEqual(cellsWithTag(both, "solid"), [{ column: 0, row: 0 }]);
    assert.deepEqual(cellsWithTag(both, "hazard"), [{ column: 0, row: 0 }]);
  });

  it("returns nothing rather than throwing when no cell carries the tag", () => {
    assert.deepEqual(cellsWithTag(map, "goal"), []);
    assert.deepEqual(cellsWithTag(createTileMap("?", CONFIG), "solid"), []);
    assert.deepEqual(cellsWithTag(createTileMap("", CONFIG), "solid"), []);
  });

  it("reads a ragged row as ending where the text ends, not as the row below", () => {
    const ragged = createTileMap(["#..", "#", "..#"], CONFIG);

    // The short row is empty past its end: column 2 of row 1 is sky, not the `#` of row 2.
    assert.deepEqual(cellsWithTag(ragged, "solid"), [
      { column: 0, row: 0 },
      { column: 0, row: 1 },
      { column: 2, row: 2 },
    ]);
  });
});

describe("solidInRect", () => {
  it("keeps the right and bottom edges out of the rectangle", () => {
    // Solid at column 2 and at row 2, and nowhere else: a rectangle that ends exactly on either
    // boundary must answer "no". If the edge were included, both of these would turn solid.
    const edges = createTileMap(["..#", "...", "###"], CONFIG);

    assert.equal(solidInRect(edges, 32, 0, 64, 32, "solid"), false, "ends where column 2 starts");
    assert.equal(solidInRect(edges, 0, 32, 32, 64, "solid"), false, "ends where row 2 starts");
    assert.equal(solidInRect(edges, 64, 0, 96, 32, "solid"), true, "starts where column 2 starts");
    assert.equal(solidInRect(edges, 0, 64, 32, 96, "solid"), true, "starts where row 2 starts");
    assert.equal(solidInRect(edges, 32, 32, 64, 64.0001, "solid"), true, "a sliver into the floor");
  });

  it("does not throw at the world edge, and an empty rectangle misses", () => {
    assert.equal(solidInRect(map, -100, -100, -50, -50, "solid"), false);
    assert.equal(solidInRect(map, 380, 0, 500, 96, "solid"), true, "the right wall at column 11");
    assert.equal(solidInRect(map, 32, 32, 32, 64, "solid"), false, "zero width");
  });
});

describe("surfaceRowBelow", () => {
  it("finds the floor from a foot resting on it and from half a pixel above it", () => {
    // The floor's top edge is y = 64. A body at rest has bottom === 64; a body that is 0.5px up has
    // bottom === 63.5. Both stand on row 2 — reading `bottom / cell` gives row 2 and row 1, which is
    // the off-by-one tile that cost an hour.
    assert.equal(surfaceRowBelow(map, 64, 64, "solid", { maxRows: 3 }), 2);
    assert.equal(surfaceRowBelow(map, 64, 63.5, "solid", { maxRows: 3 }), 2);
  });

  it("takes x in pixels, not a column, so the caller never divides", () => {
    const wallAtColumnOne = createTileMap([".#", ".."], CONFIG);

    assert.equal(surfaceRowBelow(wallAtColumnOne, 33, 0, "solid", { maxRows: 2 }), 0);
    assert.equal(surfaceRowBelow(wallAtColumnOne, 31, 0, "solid", { maxRows: 2 }), undefined);
  });

  it("looks only as far down as it was told", () => {
    // Row 2 is the floor; a point at the top sees it within 3 rows but not within 2.
    assert.equal(surfaceRowBelow(map, 64, 0, "solid", { maxRows: 3 }), 2);
    assert.equal(surfaceRowBelow(map, 64, 0, "solid", { maxRows: 2 }), undefined);
    assert.equal(surfaceRowBelow(map, 64, 0, "solid", { maxRows: 0 }), undefined);
  });

  it("returns undefined over a pit rather than the floor at the bottom of the world", () => {
    const pit = createTileMap(["#..........#", "#..........#", "#..........#"], CONFIG);

    assert.equal(surfaceRowBelow(pit, 64, 0, "solid", { maxRows: 3 }), undefined);
  });
});

describe("visibleColumns", () => {
  it("is exactly the columns the view touches, with no margin", () => {
    // 12 columns of 32px. A 320px view from 0 covers columns 0..9: x = 320 is the left edge of
    // column 10, and the range is half open, so column 10 is not in it.
    assert.deepEqual(visibleColumns(map, 0, 320), { first: 0, end: 10 });
    assert.deepEqual(visibleColumns(map, 100, 64), { first: 3, end: 6 });
    assert.deepEqual(visibleColumns(map, 40, 1), { first: 1, end: 2 });
  });

  it("widens by the margin the caller asks for, and clamps to the map", () => {
    assert.deepEqual(visibleColumns(map, 0, 320, { margin: 1 }), { first: 0, end: 11 });
    assert.deepEqual(visibleColumns(map, 100, 64, { margin: 1 }), { first: 2, end: 7 });
    // Both ends run into the map and stop there.
    assert.deepEqual(visibleColumns(map, 0, 4000, { margin: 3 }), { first: 0, end: 12 });
  });

  it("covers every cell the view touches, for any camera position", () => {
    // The property the two samples need from it: a column that was drawn before is still drawn.
    for (let left = -200; left <= 600; left += 7) {
      const touched = {
        first: Math.max(0, Math.floor(left / 32)),
        end: Math.min(12, Math.ceil((left + 320) / 32)),
      };
      if (touched.end <= touched.first) continue; // nothing on the map is visible from there

      const range = visibleColumns(map, left, 320, { margin: 1 });
      assert.ok(range.first <= touched.first, `first ${range.first} misses column ${touched.first} at ${left}`);
      assert.ok(range.end >= touched.end, `end ${range.end} misses column ${touched.end - 1} at ${left}`);
    }
  });

  it("says 'nothing is visible' with no column numbers outside the map", () => {
    // Past the right edge: the old hand-written formula returned `first: 12` here, a column that
    // does not exist. A caller indexing `columns[first]` would read undefined, not an empty range.
    assert.deepEqual(visibleColumns(map, 400, 64), { first: 0, end: 0 });
    assert.deepEqual(visibleColumns(map, -200, 64), { first: 0, end: 0 });

    // Zero width is not "one column": nothing is visible.
    assert.deepEqual(visibleColumns(map, 40, 0), { first: 0, end: 0 });
    assert.deepEqual(visibleColumns(map, 40, -10), { first: 0, end: 0 });

    // A map with no columns has nothing to show.
    assert.deepEqual(visibleColumns(createTileMap("", CONFIG), 0, 320), { first: 0, end: 0 });
  });

  it("draws exactly the columns it names", () => {
    const range = visibleColumns(map, 100, 64);

    const drawn = [];
    for (let column = range.first; column < range.end; column += 1) drawn.push(column);

    assert.deepEqual(drawn, [3, 4, 5]);
  });
});

describe("tagIn", () => {
  it("answers exactly what the three functions it binds answer", () => {
    // The point of the binding is that the three answers are one word, not three typings. If they
    // ever disagree, this is the test that says so, and it says it about the same map.
    const solid = tagIn(map, "solid");

    for (let row = 0; row < mapRows(map); row += 1) {
      for (let column = 0; column < mapColumns(map); column += 1) {
        assert.equal(solid.has(column, row), hasTag(map, column, row, "solid"), `has ${column},${row}`);
      }
    }

    for (let left = -32; left <= 400; left += 32) {
      for (let top = -32; top <= 128; top += 32) {
        const right = left + 32;
        const bottom = top + 32;
        assert.equal(
          solid.inRect(left, top, right, bottom),
          solidInRect(map, left, top, right, bottom, "solid"),
          `inRect ${left},${top}`,
        );
        assert.equal(
          solid.surfaceBelow(left, top, { maxRows: 3 }),
          surfaceRowBelow(map, left, top, "solid", { maxRows: 3 }),
          `surfaceBelow ${left},${top}`,
        );
      }
    }
  });

  it("keeps two tags on one tile apart", () => {
    // `*` is solid *and* a hazard: the reason tags are a set and not a character.
    const both = createTileMap("*.", { ...CONFIG, cell: 32 });

    assert.equal(tagIn(both, "solid").has(0, 0), true);
    assert.equal(tagIn(both, "hazard").has(0, 0), true);
    assert.equal(tagIn(both, "solid").has(1, 0), false);
  });

  it("answers 'no' for a tag nobody uses, instead of throwing", () => {
    // A misspelled tag is the failure this binding exists to make visible in one place. The library
    // still cannot call a word wrong — but it can refuse to be the thing that hides it.
    const sold = tagIn(map, "sold");

    assert.equal(sold.has(0, 2), false);
    assert.equal(sold.inRect(0, 64, 384, 96), false);
    assert.equal(sold.surfaceBelow(16, 96, { maxRows: 3 }), undefined);
  });

  it("holds the map it was given, so a second map does not move it", () => {
    // The reason the map is an argument: a game binds the probe where its map changes. A probe that
    // read some global "current map" would answer with the next level's walls here.
    const first = tagIn(map, "solid");
    const other = createTileMap(["..........", "..........", ".........."].join("\n"), CONFIG);

    assert.equal(first.has(0, 2), true, "the floor of the map it was bound to");
    assert.equal(tagIn(other, "solid").has(0, 2), false, "the empty map is empty");
    assert.equal(first.has(0, 2), true, "binding the second map did not move the first");
  });

  it("is half open like solidInRect, so a box beside a wall does not touch it", () => {
    // Solid at column 2 and at row 2, and nowhere else — the same map the solidInRect test uses, so
    // the binding cannot quietly change the edge rule it is supposed to pass through.
    const edges = createTileMap(["..#", "...", "###"], CONFIG);
    const solid = tagIn(edges, "solid");

    assert.equal(solid.inRect(32, 0, 64, 32), false, "ends where column 2 starts");
    assert.equal(solid.inRect(64, 0, 96, 32), true, "starts where column 2 starts");
    assert.equal(solid.inRect(0, 32, 32, 64), false, "above the floor row");
    assert.equal(solid.inRect(0, 64, 32, 96), true, "starts where row 2 starts");
  });
});
