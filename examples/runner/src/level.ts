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

/**
 * Level 3: the ground stops being a corridor. Two places ask you to *stop running* — spikes
 * directly above the step you land on, and spikes on the far side of the pit — so a player who
 * only holds right dies on the level's own geometry rather than on a faster enemy. The straight
 * R10b measures pursuit over is columns 3-8 (`chaseSightLane()`), and columns 12-14 are kept flat
 * on purpose: that is where the pursuit enemy is placed, and a level that put a step there would
 * be measuring a jump instead.
 *
 * The walker here starts at the far end of its lane facing back at you: "something is coming"
 * is the level's third verb, and it is the same walker as level 1 — no new behaviour yet.
 */
const LEVEL_THREE: ReadonlyArray<string> = [
  "..............................................................................",
  "..............................................................................",
  "..............................................................................",
  "..............................................................................",
  "..............................................................................",
  "..............................................................................",
  "..............................................................................",
  "..............................................................................",
  "..............................................................................",
  "......................^^..................................................|...",
  "..@.......^^....##########....................^^....................##########",
  "########################################...###############...#################",
  "########################################...###############...#################",
];

const LEVELS: ReadonlyArray<ReadonlyArray<string>> = [LEVEL_ONE, LEVEL_TWO, LEVEL_THREE];

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

/**
 * Where each level's walker walks, in world pixels. The walker is not a tile character, so its
 * lane lives here instead of in the level text: the game and the test read the same numbers, and
 * "how much landing does the pit leave you" stops being a coincidence of two files.
 *
 * Level 1's pit ends at x=1184; this lane starts at x=1280, which is three tiles of landing — the
 * floor between the jump and the walker used to be one tile (32 px), which is not a gap a person
 * can see, only one a bot with 80 px of look-ahead can survive.
 */
const PATROLS: ReadonlyArray<{ minX: number; maxX: number; dir: 1 | -1 } | null> = [
  { minX: 40 * TILE, maxX: 47 * TILE, dir: 1 },
  null,
  // Level 3's walker walks *toward* the runner: it starts at the far end of the lane, facing back.
  { minX: 32 * TILE, maxX: 37 * TILE, dir: -1 },
];

/** The current level's walker lane (or null when the level has none). */
export function patrolRange(): { minX: number; maxX: number; dir: 1 | -1 } | null {
  return PATROLS[current] ?? null;
}

/**
 * The straight a pursuit is measured over (R10b): level 3, columns 3-8, 192 px of floor with
 * nothing above it. The spec fixes these columns, and the test reads them from here rather than
 * repeating the numbers — the same rule as `goalLineX()`: one number, one reader each.
 *
 * It is the level's entry, not a measuring lane cut into the terrain: the walker you meet in
 * level 3 is first seen from here, which is why the only long straight in the level is this one.
 */
const CHASE_SIGHT_LANES: ReadonlyArray<{ startX: number; endX: number } | null> = [
  null,
  null,
  { startX: 3 * TILE, endX: 9 * TILE },
];

/** The current level's pursuit-measurement straight, or null when it has none. */
export function chaseSightLane(): { startX: number; endX: number } | null {
  return CHASE_SIGHT_LANES[current] ?? null;
}

/**
 * Where the pursuit enemy is placed on level 3: columns 12-14, kept flat on purpose. The spec
 * fixes these columns, so the test reads them from here instead of trusting that nobody puts a
 * step in the way — and the enemy's own spawn point comes from the same numbers.
 */
const CHASE_SPAWN_LANES: ReadonlyArray<{ startX: number; endX: number } | null> = [
  null,
  null,
  { startX: 12 * TILE, endX: 15 * TILE },
];

/** The current level's flat ground for a pursuit enemy to start on, or null when it has none. */
export function chaseSpawnLane(): { startX: number; endX: number } | null {
  return CHASE_SPAWN_LANES[current] ?? null;
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
