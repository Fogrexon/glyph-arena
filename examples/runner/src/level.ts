/**
 * The one level of the vertical slice, as text.
 *
 * `#` is ground, `^` is a spike, `=` is a one-way-ish ledge (solid here), `@` is
 * the spawn, `|` is the goal. Text keeps the level readable in a diff and lets a
 * test check its shape without a browser.
 */
export const TILE = 32;

export const LEVEL: ReadonlyArray<string> = [
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

export type TileKind = "empty" | "solid" | "hazard" | "goal" | "spawn";

/** What sits at tile coordinates, with anything outside the level counting as sky. */
export function tileAt(column: number, row: number): TileKind {
  const line = LEVEL[row];
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
  return LEVEL.reduce((widest, line) => Math.max(widest, line.length), 0);
}

export function levelRows(): number {
  return LEVEL.length;
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
  for (let row = 0; row < LEVEL.length; row += 1) {
    const column = (LEVEL[row] ?? "").indexOf("@");
    if (column >= 0) {
      return { x: column * TILE, y: row * TILE };
    }
  }
  return { x: 0, y: 0 };
}

/** Where the goal flag stands, in world pixels. */
export function goalPoint(): { x: number; y: number } | null {
  for (let row = 0; row < LEVEL.length; row += 1) {
    const column = (LEVEL[row] ?? "").indexOf("|");
    if (column >= 0) {
      return { x: column * TILE, y: row * TILE };
    }
  }
  return null;
}
