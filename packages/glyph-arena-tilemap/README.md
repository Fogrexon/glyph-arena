# @fogrexon/glyph-arena-tilemap

Tile maps as text, and the two questions a platformer asks of them: *what is in this box*, and
*what am I standing on*.

The package has **no grid of its own and no vocabulary of its own**. The cell size comes from the
game's config, and `solid` / `hazard` are the caller's words — a tile may carry any number of tags.

```ts
import { createTileMap, tagIn } from "@fogrexon/glyph-arena-tilemap";

const legend = { "#": ["solid"], "^": ["hazard"], "*": ["solid", "hazard"] };
const map = createTileMap(
  ["............", "............", "####^^^^####"].join("\n"),
  { legend, cell: 32 },
);

// One word, bound to the map once: the tag is written here and nowhere else.
const solid = tagIn(map, "solid");

// Is this box solid? Half open: [left, right) and [top, bottom).
solid.inRect(x, y, x + w, y + h);

// What is under my feet, within 3 rows? Both arguments are pixels.
const row = solid.surfaceBelow(x + w / 2, y + h, { maxRows: 3 });
row === undefined; // a pit within three rows: nothing to stand on
```

## Why the arguments are pixels

A body at rest has its `bottom` exactly on a cell boundary, and `bottom / cell` there reads the row
*below* the one it stands on. That off-by-one is why a chase could never start, and it cannot be
fixed by being more careful: it is fixed by not letting the call site do the conversion. So
`surfaceRowBelow` takes `x` and `y` in pixels and computes both the column and the row itself.

## One tag, bound once

A platformer asks about its floor three ways — one cell, a box, and the ground under a foot — and every
sample wrote the same wrapper for each, passing `"solid"` again at the call. `tagIn(map, tag)` binds the
word to the map and hands back the four questions: `has`, `inRect`, `surfaceBelow`, `cells`.

```ts
const solid = tagIn(map, "solid");
solid.has(column, row);                       // hasTag(map, column, row, "solid")
solid.inRect(left, top, right, bottom);       // solidInRect(map, …, "solid")
solid.surfaceBelow(x, y, { maxRows: 3 });     // surfaceRowBelow(map, x, y, "solid", …)
solid.cells();                                // cellsWithTag(map, "solid")
```

A misspelled tag is not an error in this package — it is a map where nothing is solid. Binding it once
does not make the spelling right, it makes the spelling **one thing**: the answer to "is the floor
solid" and the answer to "is this box solid" cannot disagree.

The map is an argument, not a global, so a game that swaps levels binds the probe where the map changes
(`loadLevel`), not at module load — a probe bound once at module load collides level 2 against level 1's
walls.

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
- `tagIn(map, tag)` → `{ has, inRect, surfaceBelow, cells }`: the four questions above with the tag
  written once. Bind it where the map changes.
