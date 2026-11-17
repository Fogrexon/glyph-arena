/**
 * The endless run's policy, kept apart from the drawing and the loop so it can
 * be read and tested on its own.
 *
 * A run has no finish line. It gets harder on a clock: every `RAMP_SECONDS` the
 * enemies arrive 10% faster and one more of them arrives at a time. Both stop at
 * a cap, because past it the player cannot read one arrival before the next --
 * and a run that ends in a blur is not a run anybody wants to repeat.
 *
 * No RNG anywhere: the run is the same run at the same second.
 */

/** How often the run steps up. */
export const RAMP_SECONDS = 30;

/** How much faster each step is. */
export const SPEED_STEP = 0.1;

/** How many enemies arrive per slot at most. */
export const MAX_CONCURRENT = 4;

/** No enemy moves faster than this, however long the run goes. */
export const MAX_ENEMY_SPEED = 320;

/** What one parry is worth. */
export const PARRY_SCORE = 100;

/** A parry this close to the contact instant is a "clean" one and earns a little more. */
export const PRECISE_PARRY_MS = 40;
export const PRECISE_BONUS = 50;

/** Every `STREAK_LENGTH` parries in a row (no hit in between) pay a bonus. */
export const STREAK_LENGTH = 5;
export const STREAK_BONUS = 50;

/** Seconds -> speed multiplier. 1 for the first 30 s, then 1.1, 1.2, ... */
export function speedRampAt(seconds: number): number {
  return 1 + SPEED_STEP * Math.floor(Math.max(0, seconds) / RAMP_SECONDS);
}

/** Seconds -> how many enemies arrive together. One more every step, up to the cap. */
export function concurrentAt(seconds: number): number {
  return Math.min(1 + Math.floor(Math.max(0, seconds) / RAMP_SECONDS), MAX_CONCURRENT);
}

/**
 * Where a point reappears once it has left the arena.
 *
 * The run cannot afford to delete enemies (a missing enemy is a safe run) and it
 * cannot afford to leave them outside either (nothing would ever come back), so
 * an enemy that leaves one side enters from the opposite one at the same margin.
 */
export function wrapAxis(value: number, size: number, margin: number): number {
  if (value < -margin) {
    return size + margin;
  }
  if (value > size + margin) {
    return -margin;
  }
  return value;
}
