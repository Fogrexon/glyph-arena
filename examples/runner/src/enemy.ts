/**
 * The pursuit rules, as numbers and pure functions.
 *
 * A dungeon-crawler chaser is easy to make unfair: if it is faster than the run, the level is a
 * coin flip. These rules are built the other way round — the pursuer is **slower than you**
 * (90 against a 320 run), so flat ground always lets you walk away from it. What it punishes is
 * standing still: 224 px at 90 px/s is 2.49 s, so stopping to line up a jump is what costs.
 *
 * It also refuses to leave its floor: no jumping, no falling off a ledge, no climbing. That is
 * what makes height a way out rather than a decoration.
 *
 * Pure so the game, the unit test and the acceptance test read the same numbers — the rule that
 * "a test that repeats a constant is a test that can drift" has already cost this project a day.
 */

export const CHASE = {
  /** px/s while pursuing. The run is 320, so the pursuer can never close a gap by being fast. */
  speedPxPerSecond: 90,
  /** It notices the runner inside this horizontal distance. */
  sightPx: 224,
  /** It does not start before this much play has happened: the level has to be read first. */
  startSeconds: 1,
  /** Off-screen for this long and it gives up (walk back in and it notices you again). */
  loseSightSeconds: 1.5,
  /** A height difference bigger than this is a wall or a ledge, not floor it will walk on. */
  stepTolerancePx: 32,
} as const;

export type ChaseInput = {
  /** Horizontal distance to the runner, in px (sign ignored). */
  distancePx: number;
  /**
   * Height of the ground one pixel ahead of its feet, relative to its own feet:
   * `0` flat, `+32` a one-tile lip, `-32` a one-tile drop, `Infinity` a hole.
   */
  stepPx: number;
  /** Seconds of play so far. */
  elapsedSeconds: number;
};

/** True when a patrol may turn into a pursuit. */
export function startsChasing({ distancePx, stepPx, elapsedSeconds }: ChaseInput): boolean {
  return (
    elapsedSeconds >= CHASE.startSeconds &&
    Math.abs(distancePx) <= CHASE.sightPx &&
    Math.abs(stepPx) <= CHASE.stepTolerancePx
  );
}

/**
 * True while a pursuit may keep walking. Flat floor only: a lip is a wall it will not climb, a
 * drop is a ledge it will not walk off, and a hole ends the pursuit.
 */
export function keepsChasing(stepPx: number): boolean {
  return stepPx === 0;
}
