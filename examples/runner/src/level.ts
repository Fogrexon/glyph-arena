/**
 * The levels of the run: three maps, the lanes this game measures over, and the two points a run
 * is built around. Every question about tiles — "can I stand here", "what floor is under this
 * foot" — is answered by `@fogrexon/glyph-arena-tilemap`; the cell loops and the pixel-to-row
 * arithmetic that used to live here are gone, and with them the one-tile slip that cost a day.
 *
 * The level texts live in `levels.json` so that this file stays code: a level is content, and
 * content is not what the line count is about.
 */
import {
  createTileMap,
  hasTag,
  mapColumns,
  mapRows,
  solidInRect,
  surfaceRowBelow,
  type TileMap,
} from "@fogrexon/glyph-arena-tilemap";

import LEVEL_DATA from "./levels.json";

/** A level is its text plus the places this game measures over. Shape only; the content is JSON. */
interface LevelData {
  readonly rows: readonly string[];
  readonly patrol: { readonly minColumn: number; readonly maxColumn: number; readonly dir: 1 | -1 } | null;
  readonly chaseSight: { readonly startColumn: number; readonly endColumn: number } | null;
  readonly chaseSpawn: { readonly startColumn: number; readonly endColumn: number } | null;
}

/** The game's cell size. The library has no grid of its own; this number is ours. */
export const TILE = 32;

/**
 * This game's vocabulary. The library keeps tags as a set and knows none of these words, so a
 * character may carry several tags later (`^` solid *and* hazard) without changing here.
 */
const LEGEND: Readonly<Record<string, readonly string[]>> = {
  "#": ["solid"],
  "=": ["solid"],
  "^": ["hazard"],
  "|": ["goal"],
  "@": ["spawn"],
};

const KINDS = [...new Set(Object.values(LEGEND).flat())] as TileKind[];

const LEVELS = LEVEL_DATA as readonly LevelData[];
const MAPS: readonly TileMap[] = LEVELS.map((level) => createTileMap(level.rows, { legend: LEGEND, cell: TILE }));

let current = 0;

/** How many levels the run has. */
export function levelCount(): number {
  return MAPS.length;
}

/** Which level is loaded, 0-based. */
export function currentLevel(): number {
  return current;
}

/** Point every tile lookup at one level. Throws rather than silently drawing sky. */
export function loadLevel(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= MAPS.length) {
    throw new RangeError(`no level ${index}: the run has ${MAPS.length}`);
  }
  current = index;
}

/**
 * The loaded map, for callers that need the map itself — which columns a view covers is a question
 * for `visibleColumns`, and it takes the map, not a count.
 */
export function currentMap(): TileMap {
  return MAPS[current] as TileMap;
}

function map(): TileMap {
  return currentMap();
}

function level(): LevelData {
  return LEVELS[current] as LevelData;
}

export type TileKind = "empty" | "solid" | "hazard" | "goal" | "spawn";

/** What sits at tile coordinates, with anything outside the level counting as sky. */
export function tileAt(column: number, row: number): TileKind {
  return KINDS.find((kind) => hasTag(map(), column, row, kind)) ?? "empty";
}

/** Width in tiles, taken from the longest row so a short line cannot shrink the world. */
export function levelColumns(): number {
  return mapColumns(map());
}

export function levelRows(): number {
  return mapRows(map());
}

/** True for any tile the body cannot pass through. */
export function isSolidTile(column: number, row: number): boolean {
  return hasTag(map(), column, row, "solid");
}

export function isHazardTile(column: number, row: number): boolean {
  return hasTag(map(), column, row, "hazard");
}

/** Is any solid tile inside the pixel rectangle? Half-open edges are the library's rule now. */
export function solidAt(left: number, top: number, right: number, bottom: number): boolean {
  return solidInRect(map(), left, top, right, bottom, "solid");
}

/**
 * Is there a hazard tile inside the rectangle, widened by `margin` px on each side?
 *
 * The margin is how "far enough from what kills you" gets a definition: a respawn point has to be
 * `SAFE_CLEARANCE` away, or the death returns you somewhere you cannot react from.
 */
export function hazardWithin(x: number, y: number, w: number, h: number, margin = 0): boolean {
  return solidInRect(map(), x - margin, y - margin, x + w + margin, y + h + margin, "hazard");
}

/**
 * The row of floor under a point, or `Infinity` for a hole. Pixels in, a row out.
 *
 * `maxRows: 3` is this game's decision: a body rests a few px above its floor, so the row under
 * its feet is not always `bottom / TILE`, and looking further than two rows down would find the
 * floor beneath a pit and call it ground.
 */
export function surfaceBelow(xPx: number, yPx: number): number {
  return surfaceRowBelow(map(), xPx, yPx, "solid", { maxRows: 3 }) ?? Number.POSITIVE_INFINITY;
}

/**
 * Where each level's walker walks, in columns (see `levels.json`). The walker is not a tile
 * character, so its lane is level data rather than a character: the game and the test read the
 * same numbers, and "how much landing does the pit leave you" stops being a coincidence of two
 * files. Level 1's pit ends at column 37; this lane starts at column 40, three tiles of landing.
 */
export function patrolRange(): { minX: number; maxX: number; dir: 1 | -1 } | null {
  const lane = level().patrol;
  return lane === null ? null : { minX: lane.minColumn * TILE, maxX: lane.maxColumn * TILE, dir: lane.dir };
}

/**
 * The straight a pursuit is measured over (R10b): level 3, columns 3-9, 192 px of floor with
 * nothing above it. The spec fixes these columns, and the test reads them from here rather than
 * repeating the numbers — the same rule as `goalLineX()`: one number, one reader each.
 */
export function chaseSightLane(): { startX: number; endX: number } | null {
  const lane = level().chaseSight;
  return lane === null ? null : { startX: lane.startColumn * TILE, endX: lane.endColumn * TILE };
}

/**
 * Where the pursuit enemy is placed on level 3: columns 12-15, kept flat on purpose. The spec
 * fixes these columns, so the test reads them from here instead of trusting that nobody puts a
 * step in the way — and the enemy's own spawn point comes from the same numbers.
 */
export function chaseSpawnLane(): { startX: number; endX: number } | null {
  const lane = level().chaseSpawn;
  return lane === null ? null : { startX: lane.startColumn * TILE, endX: lane.endColumn * TILE };
}

/** The first cell carrying `tag`, in world pixels (top-left of the cell), or null. */
function pointOf(tag: string): { x: number; y: number } | null {
  for (let row = 0; row < levelRows(); row += 1) {
    for (let column = 0; column < levelColumns(); column += 1) {
      if (hasTag(map(), column, row, tag)) return { x: column * TILE, y: row * TILE };
    }
  }
  return null;
}

/** Where the run starts, in world pixels (feet, not centre). */
export function spawnPoint(): { x: number; y: number } {
  return pointOf("spawn") ?? { x: 0, y: 0 };
}

/**
 * The x the runner has to pass to clear the level. The game and the bot both read this, so a
 * test cannot pass a level the game would not clear.
 */
export function goalLineX(): number {
  return (levelColumns() - 2) * TILE;
}

/** Where the goal flag is drawn, in world pixels. */
export function goalPoint(): { x: number; y: number } | null {
  return pointOf("goal");
}
