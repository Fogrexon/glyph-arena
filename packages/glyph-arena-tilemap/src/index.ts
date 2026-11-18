/**
 * Tiles, as text, and the two questions a platformer asks of them.
 *
 * A map is a list of lines; a legend says what each character means; and a cell size turns those
 * cells into pixels. Nothing here knows that `solid` or `hazard` exist — tags are the caller's
 * words, and a tile may carry any number of them, which is why a question about a tile is asked as
 * `hasTag` and never as `tile === "solid"` (that answers for whichever tag was checked first the
 * day one tile carries two).
 *
 * ## The cell size belongs to the game
 *
 * This package has no grid of its own. `cell` comes from the config because 32 is a fact about the
 * game, not about tile maps — the same map can be drawn at any scale. What the package does own is
 * every conversion between pixels and cells: callers pass pixels and get rows back, so nobody
 * outside writes `Math.floor(y / cell)` and reads the wrong row by one, which is the bug this
 * package was extracted to make impossible.
 *
 * ## Rectangles are half open
 *
 * `solidInRect` treats `left` / `top` as inside and `right` / `bottom` as outside: `[left, right)`
 * and `[top, bottom)`. A box whose right edge sits exactly on a cell boundary does not touch the
 * cell after it, so a caller never has to subtract a fraction to stop it from colliding with the
 * wall it is standing beside.
 */

/** The tags a tile carries. `solid`, `hazard`, … are the caller's words; this package has none. */
export type TileTags = readonly string[];

export interface TileMapConfig {
  /** One entry per character used in the maps. A character with no entry is an empty tile. */
  legend: Readonly<Record<string, TileTags>>;
  /** The size of one cell in pixels. The map has no grid of its own: the game owns this number. */
  cell: number;
}

export interface TileMap {
  /** The map, one string per row. Rows may be shorter than `columns`; the gap is empty. */
  readonly lines: readonly string[];
  readonly cell: number;
  /** The width of the widest row: what the world is as wide as. */
  readonly columns: number;
  readonly rows: number;
  readonly legend: Readonly<Record<string, TileTags>>;
}

/** No tags at all. Shared so that "empty" allocates nothing and compares by content, not identity. */
const NONE: TileTags = [];

export function createTileMap(text: string | readonly string[], config: TileMapConfig): TileMap {
  // A string is the usual case (a template literal in the game), an array is what a map built in
  // code looks like. A trailing newline would otherwise become a row of nothing.
  const lines = (typeof text === "string" ? text.split(/\r?\n/) : [...text]).map((line) => line);
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  let columns = 0;
  for (const line of lines) columns = Math.max(columns, line.length);

  return { lines, cell: config.cell, columns, rows: lines.length, legend: config.legend };
}

/** The width of the map in cells: the longest row, so a short row does not shrink the world. */
export function mapColumns(map: TileMap): number {
  return map.columns;
}

/** The height of the map in cells. */
export function mapRows(map: TileMap): number {
  return map.rows;
}

/** The character at a cell, or `undefined` outside the map. Never throws: every query is clipped. */
export function tileAt(map: TileMap, column: number, row: number): string | undefined {
  return map.lines[row]?.[column];
}

/** The tags at a cell. Empty for an unknown character and for anywhere outside the map. */
export function tagsAt(map: TileMap, column: number, row: number): TileTags {
  const character = tileAt(map, column, row);
  if (character === undefined) return NONE;

  return map.legend[character] ?? NONE;
}

/** Does the tile carry this tag? Asked per tag, so a tile may answer yes to more than one. */
export function hasTag(map: TileMap, column: number, row: number, tag: string): boolean {
  return tagsAt(map, column, row).includes(tag);
}

/** A cell address: column and row, never pixels. A caller that wants pixels multiplies by `map.cell`. */
export interface TileCell {
  readonly column: number;
  readonly row: number;
}

/**
 * Every cell carrying `tag`, in reading order: row by row, left to right, top to bottom.
 *
 * `hasTag` answers about one cell, so "where are the spawn points" was a nested loop at the call
 * site in every game that asked — two of them written twice, each repeating the row/column order
 * and the `* cell`. Reading order is part of the answer and not an accident: the first spawn point
 * in the text is the one a run starts at, so a set or an unordered walk would make the start a coin
 * flip. For the same reason `cellsWithTag(...)[0]` is the first cell, and the common "where does
 * this start" question needs no second function.
 *
 * Returns cells, not pixels, unlike the rest of this package: the map is the same map at any scale,
 * so the pixels belong to whoever chose the scale — and `map.cell` is right there when it is needed.
 */
export function cellsWithTag(map: TileMap, tag: string): TileCell[] {
  const cells: TileCell[] = [];

  for (let row = 0; row < map.rows; row += 1) {
    for (let column = 0; column < map.columns; column += 1) {
      if (hasTag(map, column, row, tag)) {
        cells.push({ column, row });
      }
    }
  }

  return cells;
}

/**
 * Is there a tile carrying `tag` anywhere in the pixel rectangle `[left, right)` × `[top, bottom)`?
 *
 * Out-of-range cells are empty rather than an error: a body standing on the world edge asks about
 * a box that pokes past it every frame, and a throw there would be a crash on the boundary.
 */
export function solidInRect(
  map: TileMap,
  left: number,
  top: number,
  right: number,
  bottom: number,
  tag: string,
): boolean {
  const first = Math.floor(left / map.cell);
  const lastColumn = Math.ceil(right / map.cell) - 1;
  const firstRow = Math.floor(top / map.cell);
  const lastRow = Math.ceil(bottom / map.cell) - 1;

  for (let row = firstRow; row <= lastRow; row += 1) {
    if (row < 0 || row >= map.rows) continue;
    for (let column = first; column <= lastColumn; column += 1) {
      if (hasTag(map, column, row, tag)) return true;
    }
  }

  return false;
}

/**
 * The columns a view covers, as a half-open range `[first, end)` — the same shape as
 * `solidInRect`, because two shapes in one package is how the next person loses a column.
 *
 * `leftPx` and `widthPx` are pixels, like everywhere else here: the caller does not divide, so it
 * cannot read the column beside the one it means. Both ends are clamped to the map, so a camera
 * before the world starts yields `first: 0`.
 *
 * `margin` widens the range by that many columns on each side, and it is the caller's number, not
 * this package's: a loop that draws whole tiles wants one extra column so a tile half off the edge
 * is still drawn, while a loop that counts what is *visible* wants none. With `margin: 0` the range
 * is exactly the cells the view touches.
 *
 * Nothing is visible in three cases — the view is past either end of the map, `widthPx` is zero or
 * less, or the map has no columns — and they all answer `{ first: 0, end: 0 }` rather than a column
 * number outside the map. `end <= first` is the test, and a loop `for (c = first; c < end; c++)`
 * then draws nothing instead of one wrong column.
 */
export function visibleColumns(
  map: TileMap,
  leftPx: number,
  widthPx: number,
  options: { margin: number } = { margin: 0 },
): { first: number; end: number } {
  if (map.columns === 0 || widthPx <= 0) return { first: 0, end: 0 };

  const first = Math.max(0, Math.floor(leftPx / map.cell) - options.margin);
  const end = Math.min(map.columns, Math.ceil((leftPx + widthPx) / map.cell) + options.margin);

  // `first` may be at or past `end` (the view is off the map): the caller gets an empty range, not
  // a column number that does not exist.
  if (end <= first) return { first: 0, end: 0 };

  return { first, end };
}

/**
 * The first row at or below the pixel point `(xPx, yPx)` whose tile carries `tag`, or `undefined`.
 *
 * Both arguments are pixels and the columns and rows are computed here, because the caller getting
 * that conversion wrong is the bug this function exists to remove: a body's foot sits at its
 * `bottom`, which at rest is exactly a cell boundary, and `bottom / cell` there reads the row
 * *below* the one it is standing on. `maxRows` is required, not defaulted — a search that never
 * stops finds the floor under a pit and calls it ground, so how far down to look is the game's
 * decision and has to be written at the call site.
 */
export function surfaceRowBelow(
  map: TileMap,
  xPx: number,
  yPx: number,
  tag: string,
  options: { maxRows: number },
): number | undefined {
  const column = Math.floor(xPx / map.cell);
  const firstRow = Math.floor(yPx / map.cell);
  const lastRow = firstRow + options.maxRows - 1;

  for (let row = firstRow; row <= lastRow; row += 1) {
    if (hasTag(map, column, row, tag)) return row;
  }

  return undefined;
}

/**
 * One tag, bound to one map: the three questions a game asks about it, with the word written once.
 *
 * A platformer asks about its floor three ways — "is this cell solid", "is anything solid in this
 * box", "what floor is under this foot" — and each of the three samples wrote the same wrapper for
 * each, passing `"solid"` again at every call. That is a magic string: spelled wrong it is not an
 * error, it is a map where nothing is solid, and the body falls through the floor with no message.
 * Binding the tag once makes the word one thing, and the three answers are the same word by
 * construction rather than by three people typing it correctly.
 *
 * The map is an argument and not captured from anywhere global, which is the other half of the
 * point: a game that swaps levels has a different map after the swap. Bind the probe where the map
 * changes (`loadLevel`), not at module load, or level 2 is collided against with level 1's walls —
 * a bug that looks like "the new level's floor is wrong" and is not about the level at all.
 */
export interface TagView {
  /** `hasTag(map, column, row, tag)`, with the cell address still the caller's. */
  readonly has: (column: number, row: number) => boolean;
  /** `solidInRect(map, left, top, right, bottom, tag)`: half open, `[left, right)` × `[top, bottom)`. */
  readonly inRect: (left: number, top: number, right: number, bottom: number) => boolean;
  /** `surfaceRowBelow(map, xPx, yPx, tag, options)`. `maxRows` stays required, and stays the game's. */
  readonly surfaceBelow: (xPx: number, yPx: number, options: { maxRows: number }) => number | undefined;
  /** `cellsWithTag(map, tag)`: every cell carrying the tag, in reading order. */
  readonly cells: () => TileCell[];
}

export function tagIn(map: TileMap, tag: string): TagView {
  return {
    has: (column, row) => hasTag(map, column, row, tag),
    inRect: (left, top, right, bottom) => solidInRect(map, left, top, right, bottom, tag),
    surfaceBelow: (xPx, yPx, options) => surfaceRowBelow(map, xPx, yPx, tag, options),
    cells: () => cellsWithTag(map, tag),
  };
}
