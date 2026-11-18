/**
 * One camp, as text.
 *
 * `#` is ground, `^` is a rock (solid), `@` is where you start, `e` is where an enemy stands.
 * The cell maths is the library's: this file only names its own vocabulary and turns a tag into
 * world pixels.
 */
import {
  cellsWithTag,
  createTileMap,
  hasTag,
  mapColumns,
  mapRows,
  solidInRect,
  type TileMap,
} from "@fogrexon/glyph-arena-tilemap";

export const TILE = 32;

const LEGEND: Readonly<Record<string, readonly string[]>> = {
  "#": ["solid"],
  "^": ["solid"],
  "@": ["spawn"],
  "e": ["enemy"],
};

/**
 * Wide enough to walk, small enough that the first fight is the thing you meet. The rocks break
 * the line of sight so the enemy has to be found rather than collected.
 */
const TEXT: readonly string[] = [
  "................................................................",
  "................................................................",
  "................................................................",
  "...............................................^^^^^............",
  "................................................................",
  "................................................................",
  "................................................................",
  "................................................................",
  "........@...................................e.....e....^^^......",
  "################################################################",
  "################################################################",
];

const MAP: TileMap = createTileMap(TEXT, { legend: LEGEND, cell: TILE });

/**
 * The map, for callers that need the map itself — which columns a view covers is a question for
 * `visibleColumns`, and it takes the map, not a count.
 */
export function currentMap(): TileMap {
  return MAP;
}

export function levelColumns(): number {
  return mapColumns(MAP);
}

export function levelRows(): number {
  return mapRows(MAP);
}

/** Solid for the body: ground and rock, and nothing to the left of the world's first column. */
export function solidAt(left: number, top: number, right: number, bottom: number): boolean {
  return solidInRect(MAP, left, top, right, bottom, "solid");
}

export function isSolidTile(column: number, row: number): boolean {
  return hasTag(MAP, column, row, "solid");
}

/** Every cell carrying `tag`, in world pixels (top-left of the cell). */
function pointsOf(tag: string): Array<{ x: number; y: number }> {
  return cellsWithTag(MAP, tag).map((cell) => ({ x: cell.column * TILE, y: cell.row * TILE }));
}

/** Where the run starts, in world pixels (feet, not centre). */
export function spawnPoint(): { x: number; y: number } {
  return pointsOf("spawn")[0] ?? { x: 0, y: 0 };
}

/** Where the enemies stand. Slice one has one; the format already allows a camp. */
export function enemySpawns(): Array<{ x: number; y: number }> {
  return pointsOf("enemy");
}
