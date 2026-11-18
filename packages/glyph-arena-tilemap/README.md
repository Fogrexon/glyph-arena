# @fogrexon/glyph-arena-tilemap

Tile maps as text, and the two questions a platformer asks of them: *what is in this box*, and
*what am I standing on*.

The package has **no grid of its own and no vocabulary of its own**. The cell size comes from the
game's config, and `solid` / `hazard` are the caller's words — a tile may carry any number of tags.

```ts
import { createTileMap, hasTag, solidInRect, surfaceRowBelow } from "@fogrexon/glyph-arena-tilemap";

const legend = { "#": ["solid"], "^": ["hazard"], "*": ["solid", "hazard"] };
const map = createTileMap(
  ["............", "............", "####^^^^####"].join("\n"),
  { legend, cell: 32 },
);

// Is this box solid? Half open: [left, right) and [top, bottom).
solidInRect(map, x, y, x + w, y + h, "solid");

// What is under my feet, within 3 rows? Both arguments are pixels.
const row = surfaceRowBelow(map, x + w / 2, y + h, "solid", { maxRows: 3 });
row === undefined; // a pit within three rows: nothing to stand on
```

## Why the arguments are pixels

A body at rest has its `bottom` exactly on a cell boundary, and `bottom / cell` there reads the row
*below* the one it stands on. That off-by-one is why a chase could never start, and it cannot be
fixed by being more careful: it is fixed by not letting the call site do the conversion. So
`surfaceRowBelow` takes `x` and `y` in pixels and computes both the column and the row itself.

## Why tags are a set

`tileAt(map, c, r) === "solid"` answers for one tag only, and breaks the day a tile carries two.
Ask `hasTag(map, c, r, "solid")`.

## API

- `createTileMap(text | lines, { legend, cell })` → `TileMap` (`columns` is the longest row).
- `mapColumns(map)` / `mapRows(map)`.
- `tileAt(map, column, row)` → the character, or `undefined` outside the map.
- `tagsAt(map, column, row)` → the tile's tags; empty for an unknown character or outside.
- `hasTag(map, column, row, tag)` → boolean.
- `cellsWithTag(map, tag)` → every cell carrying `tag` as `{ column, row }`, in reading order
  (row by row, left to right). Cells, not pixels: multiply by `map.cell`. `[0]` is the first
  one, which is how a game asks "where does this start" without a second function.
- `solidInRect(map, left, top, right, bottom, tag)` → any tile with `tag` in `[left, right)` ×
  `[top, bottom)`. Out-of-range cells are empty, never an error.
- `surfaceRowBelow(map, xPx, yPx, tag, { maxRows })` → the first row at or below that point, or
  `undefined`. `maxRows` is required: a search that never stops finds the floor under a pit and
  calls it ground.
