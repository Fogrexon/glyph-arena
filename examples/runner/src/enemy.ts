/**
 * The pursuit's numbers — this game's feel, and nothing else.
 *
 * The rule itself (which way to walk, whether the ground ahead is floor, whether it has noticed
 * you) lives in `@fogrexon/glyph-arena-chase`; both samples had written the same three lines and
 * both had learned the same two lessons separately. What stays here is what is only true of this
 * dungeon: how fast it walks, how far it sees, how long it waits before starting, and how long it
 * keeps looking after you leave the screen.
 *
 * The shape of the pressure is unchanged and it is the point: the pursuer is **slower than you**
 * (90 against a 320 run), so flat ground always lets you walk away. What it punishes is standing
 * still — 224 px at 90 px/s is 2.49 s, and stopping to line up a jump is what costs.
 */

export const CHASE = {
  /** px/s while pursuing. The run is 320, so the pursuer can never close a gap by being fast. */
  speedPxPerSecond: 90,
  /** It notices the runner inside this centre-to-centre distance. */
  sightPx: 224,
  /** It does not start before this much play has happened: the level has to be read first. */
  startSeconds: 1,
  /** Off-screen for this long and it gives up (walk back in and it notices you again). */
  loseSightSeconds: 1.5,
} as const;
