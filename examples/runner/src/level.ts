/**
 * The levels of the slice, as text.
 *
 * `#` is ground, `^` is a spike, `=` is a one-way-ish ledge (solid here), `@` is
 * the spawn, `|` is the goal. Text keeps a level readable in a diff and lets a test
 * check its shape without a browser.
 *
 * Level 2 is written in exactly this notation on purpose: if a new level needs a new
 * format, the format is the thing that does not scale.
 */
export const TILE = 32;

/**
 * Level 1: flat ground, one pit, one walker, spikes hanging over the running line.
 * Nothing here asks you to change height, which is what makes level 2 a step.
 */
const LEVEL_ONE: ReadonlyArray<string> = [
  "............................................................................",
  "............................................................................",
  "............................................................................",
  ".......................................................................|....",
  "..................................................................#######...",
  "............................................................................",
  "........................####................................................",
  "............................................................................",
  "..............###...........................................................",
  "....................................................^^^.....................",
  "..@.........................................................................",
  "##################################...#######################################",
  "##################################...#######################################",
];

/**
 * Level 2: the same notation, one new demand — height. A pit, then a one-tile step
 * up onto a plateau, spikes on the plateau to clear, and the goal at the top. No walker
 * here: the new element is the step, and two new things at once stop a level from
 * telling you what killed you.
 */
const LEVEL_TWO: ReadonlyArray<string> = [
  "..................................................................",
  "..................................................................",
  "..................................................................",
  "..................................................................",
  "..................................................................",
  "..................................................................",
  "..................................................................",
  "..................................................................",
  "..................................................................",
  "....................................^^^...................|.......",
  "..@...........................####################################",
  "################..################################################",
  "################..################################################",
];

const LEVELS: ReadonlyArray<ReadonlyArray<string>> = [LEVEL_ONE, LEVEL_TWO];

let current = 0;

/** How many levels the run has. */
export function levelCount(): number {
  return LEVELS.length;
}

/** Which level is loaded, 0-based. */
export function currentLevel(): number {
  return current;
}

/** Point every tile lookup at one level. Throws rather than silently drawing sky. */
export function loadLevel(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= LEVELS.length) {
    throw new RangeError(`no level ${index}: the run has ${LEVELS.length}`);
  }
  current = index;
}

function rows(): ReadonlyArray<string> {
  return LEVELS[current] ?? [];
}

export type TileKind = "empty" | "solid" | "hazard" | "goal" | "spawn";

/** What sits at tile coordinates, with anything outside the level counting as sky. */
export function tileAt(column: number, row: number): TileKind {
  const line = rows()[row];
  if (line === undefined || column < 0) {
    return "empty";
  }
  const character = line[column];
  if (character === undefined) {
    return "empty";
  }
  if (character === "#" || character === "=") return "solid";
  if (character === "^") return "hazard";
  if (character === "|") return "goal";
  if (character === "@") return "spawn";
  return "empty";
}

/** Width in tiles, taken from the longest row so a short line cannot shrink the world. */
export function levelColumns(): number {
  return rows().reduce((widest, line) => Math.max(widest, line.length), 0);
}

export function levelRows(): number {
  return rows().length;
}

/** True for any tile the body cannot pass through. */
export function isSolidTile(column: number, row: number): boolean {
  return tileAt(column, row) === "solid";
}

export function isHazardTile(column: number, row: number): boolean {
  return tileAt(column, row) === "hazard";
}

/** Where the run starts, in world pixels (feet, not centre). */
export function spawnPoint(): { x: number; y: number } {
  for (let row = 0; row < rows().length; row += 1) {
    const column = (rows()[row] ?? "").indexOf("@");
    if (column >= 0) {
      return { x: column * TILE, y: row * TILE };
    }
  }
  return { x: 0, y: 0 };
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
  for (let row = 0; row < rows().length; row += 1) {
    const column = (rows()[row] ?? "").indexOf("|");
    if (column >= 0) {
      return { x: column * TILE, y: row * TILE };
    }
  }
  return null;
}
