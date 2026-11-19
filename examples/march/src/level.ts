/**
 * One road, as text.
 *
 * `#` is ground and wall, `^` is roof rock, `@` is where you start, `e` is where an enemy stands,
 * `g` is the goal.
 * The cell maths is the library's (`createTileMap`, `tagIn`); this file only names its own
 * vocabulary and turns a tag into world pixels.
 *
 * The shape of the road is the whole of this game's level design, so it is written as one literal
 * picture rather than built by a helper: eleven guards over 92 columns, in five beats. Beats of
 * one, two and three, with a walk between them. The grouping is what makes the question repeat —
 * a lone body asks "fight or go by", a pair asks it with less room, three asks it when there is
 * nowhere to stand.
 *
 * **The roof is not decoration.** Every beat is roofed with seven rows of rock, which leaves 64 px
 * between the floor and the ceiling: enough for a 28 px body to hop 36 px, not enough to carry its
 * feet over a 44 px guard. Without the roof the answer was free — measured, a body clears a 28 px
 * enemy at any point of a 111 px jump, so "go by all eleven" would have cost nothing and the fight
 * would have been the slow path nobody takes. The level says the rule instead of the tutorial:
 * under rock you fight, or you roll.
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
  "g": ["goal"],
};

/**
 * Eleven enemies in five beats over 92 columns of road, then the goal.
 *
 * Both edge columns are solid on **every** row, not just the standing row. The tilemap treats
 * out-of-map cells as empty, so a half-open edge is a hole you can be knocked through — the same
 * bug the tutorial, the runner and CAMP each had to close, and the reason all four samples now
 * assert it in a test instead of remembering it.
 */
const TEXT: readonly string[] = [
  "#............^^^.......^^^^^^........^^^^^^^...........^^^^^.........^^^^^^^...................................#",
  "#............^^^.......^^^^^^........^^^^^^^...........^^^^^.........^^^^^^^...................................#",
  "#............^^^.......^^^^^^........^^^^^^^...........^^^^^.........^^^^^^^...................................#",
  "#............^^^.......^^^^^^........^^^^^^^...........^^^^^.........^^^^^^^...................................#",
  "#............^^^.......^^^^^^........^^^^^^^...........^^^^^.........^^^^^^^...................................#",
  "#............^^^.......^^^^^^........^^^^^^^...........^^^^^.........^^^^^^^...................................#",
  "#............^^^.......^^^^^^........^^^^^^^...........^^^^^.........^^^^^^^...................................#",
  "#..............................................................................................................#",
  "#..@..........e.........e..e..........e.e.e.............e.e...........e.e.e.................g..................#",
  "################################################################################################################",
  "################################################################################################################",
];

const MAP: TileMap = createTileMap(TEXT, { legend: LEGEND, cell: TILE });

/** The four words this game knows, each bound to the map once. */
const SOLID = tagIn(MAP, "solid");
const SPAWN = tagIn(MAP, "spawn");
const ENEMY = tagIn(MAP, "enemy");
const GOAL = tagIn(MAP, "goal");

export function currentMap(): TileMap {
  return MAP;
}

export function levelColumns(): number {
  return mapColumns(MAP);
}

export function levelRows(): number {
  return mapRows(MAP);
}

/** Solid for the body: ground and wall, and nothing outside the map's first or last column. */
export const solidAt = SOLID.inRect;

export const isSolidTile = SOLID.has;

/** Every cell carrying `tag`, in world pixels (top-left of the cell). */
function pointsOf(tag: TagView): Array<{ x: number; y: number }> {
  return tag.cells().map((cell) => ({ x: cell.column * TILE, y: cell.row * TILE }));
}

/** Where the run starts, in world pixels (top-left of the cell, feet on the next row). */
export function spawnPoint(): { x: number; y: number } {
  return pointsOf(SPAWN)[0] ?? { x: 0, y: 0 };
}

/** Where the enemies stand, left to right. */
export function enemySpawns(): Array<{ x: number; y: number }> {
  return pointsOf(ENEMY).sort((a, b) => a.x - b.x);
}

/** The column the run ends at, in world pixels. */
export function goalX(): number {
  return pointsOf(GOAL)[0]?.x ?? levelColumns() * TILE;
}
