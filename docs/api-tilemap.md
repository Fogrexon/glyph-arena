# @fogrexon/glyph-arena-tilemap

Tile maps as text, and the two questions a platformer asks of them: what is in this box, and what am I
standing on. See also [package README](../packages/glyph-arena-tilemap/README.md).

## Exports

Generated from the package's source when the docs are built — do not edit this table by hand.

## `createTileMap(text, { legend, cell })`

```ts
const map = createTileMap(
  ["............", "............", "####^^^^####"].join("\n"),
  { legend: { "#": ["solid"], "^": ["hazard"], "*": ["solid", "hazard"] }, cell: 32 },
);
```

`columns` is the longest row, so a short line cannot shrink the world. A tile carries **tags**, not one
kind, because a tile that is both solid and a hazard is the day `tileAt() === "solid"` starts lying.

## The questions

- `mapColumns(map)` / `mapRows(map)` — the size in cells.
- `tileAt(map, column, row)` — the character, or `undefined` outside the map.
- `tagsAt(map, column, row)` — the cell's tags; empty for an unknown character or outside the map.
- `hasTag(map, column, row, tag)` — one cell, one tag.
- `cellsWithTag(map, tag)` — every cell carrying `tag` as `{ column, row }`, in reading order (row by row, left to right). Cells, not pixels: multiply by `map.cell`. The order is part of the answer — the first spawn point in the text is the one a run starts at, so `cellsWithTag(map, "at")[0]` is where it starts.
- `solidInRect(map, left, top, right, bottom, tag)` — any tile with `tag` in `[left, right)` × `[top, bottom)`, in pixels; out-of-range cells are empty, never an error.
- `surfaceRowBelow(map, xPx, yPx, tag, { maxRows })` — the first row at or below that point, or `undefined`.
- `tagIn(map, tag)` — `{ has, inRect, surfaceBelow, cells }`: the four questions above, with the tag written once.

## One tag, bound once

```ts
const solid = tagIn(map, "solid");
solid.inRect(x, y, x + w, y + h);            // the box the body is in
solid.has(column, row);                      // the cell the renderer is on
solid.surfaceBelow(x, y, { maxRows: 3 });    // the floor under a foot
```

Every sample wrote the same wrapper for each question, passing `"solid"` again at every call. A
misspelled tag is not an error here — it is a map where nothing is solid — so binding the word once
makes the three answers one thing instead of three typings.

The map is an argument, not a global: a game that swaps levels binds the probe where the map changes,
or level 2 is collided against with level 1's walls.

## Why the arguments are pixels

A body at rest has its `bottom` exactly on a cell boundary, and `bottom / cell` there reads the row
*below* the one it stands on. That off-by-one is not fixed by being more careful; it is fixed by not
letting the call site do the conversion, so `surfaceRowBelow` takes `x` and `y` in pixels and computes
both the column and the row itself.

`maxRows` is required. A search that never stops finds the floor under a pit and calls it ground.

```ts
const solid = (left: number, top: number, right: number, bottom: number) =>
  solidInRect(map, left, top, right, bottom, "solid");

const row = surfaceRowBelow(map, x + w / 2, y + h, "solid", { maxRows: 3 });
row === undefined; // a pit within three rows: nothing to stand on
```

This package does not import sibling `@fogrexon/glyph-arena-*` packages.
