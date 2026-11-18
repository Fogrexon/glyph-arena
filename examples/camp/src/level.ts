/**
 * One camp, as text.
 *
 * `#` is ground, `^` is a rock (solid), `@` is where you start, `e` is where an enemy stands.
 * The cell maths is the library's: this file only names its own vocabulary and turns a tag into
 * world pixels.
 */
import {
  createTileMap,
  mapColumns,
  mapRows,
  tagIn,
  type TagView,
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
 * Wide enough for two camps, small enough that the first fight is the thing you meet.
 *
 * A pair on open ground, then a walk of twelve tiles, then three under the hanging rocks: the
 * second fight asks the same question in a smaller room with one more body, which is where the
 * retreat runs out. Five enemies, one rule: the fight is a queue of commits (`canCommit`), so a
 * third body adds a third decision, not a second unanswerable one.
 *
 * The first column is a wall, and it is load-bearing: the tilemap treats out-of-map cells as empty,
 * so before it existed a knockback at the first camp could put the player past the left edge, where
 * there is no ground — `measured 11-18: player x -104, every enemy in walk, 48 s of nothing` — and
 * the fight could not end. A world the fight can leave is not a world.
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
  "#.......@.....................e...e...........e.e..e...^^^......",
  "################################################################",
  "################################################################",
];

const MAP: TileMap = createTileMap(TEXT, { legend: LEGEND, cell: TILE });

/** The three words this game knows, each bound to the map once. */
const SOLID = tagIn(MAP, "solid");
const SPAWN = tagIn(MAP, "spawn");
const ENEMY = tagIn(MAP, "enemy");

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
export const solidAt = SOLID.inRect;

export const isSolidTile = SOLID.has;

/** Every cell carrying `tag`, in world pixels (top-left of the cell). */
function pointsOf(tag: TagView): Array<{ x: number; y: number }> {
  return tag.cells().map((cell) => ({ x: cell.column * TILE, y: cell.row * TILE }));
}

/** Where the run starts, in world pixels (feet, not centre). */
export function spawnPoint(): { x: number; y: number } {
  return pointsOf(SPAWN)[0] ?? { x: 0, y: 0 };
}

/** Where the enemies stand. Slice one has one; the format already allows a camp. */
export function enemySpawns(): Array<{ x: number; y: number }> {
  return pointsOf(ENEMY);
}
