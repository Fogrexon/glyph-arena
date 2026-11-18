/**
 * Whether a pursuer should be walking toward something, and which way.
 *
 * Two games in this repository wrote the same three lines separately — measure the gap between
 * centres, take the sign, and notice when the gap is inside a sight radius — and both then had to
 * learn the same two rules: a pursuer that walks off a ledge is not a pursuer, and a pursuer that
 * measures from the wrong direction walks the wrong way. This package is those rules once.
 *
 * What it deliberately does **not** do:
 *
 * - **No state.** Patrol, the wait before chasing starts, how long sight has been lost, attack
 *   modes — all memory, and all the caller's. Two calls with the same arguments return the same
 *   answer (there is a test that calls it twice).
 * - **No numbers.** `sightPx` and `stepTolerancePx` are `ChaseConfig` fields with no defaults, and
 *   no speed is here at all: one game moves a plain `x`, the other feeds `stepBody`, so a speed in
 *   this package would be unusable to one of them.
 * - **No movement.** It does not take `dt` and does not touch the boxes it is given.
 */

export type ChaseSelf = {
  /** Left edge in px. */
  x: number;
  /** Width in px. */
  w: number;
  /** The way it faces now, used only when the two centres coincide. */
  dir: -1 | 1;
};

export type ChaseTarget = {
  /** Left edge in px. */
  x: number;
  /** Width in px. */
  w: number;
};

export type ChaseConfig = {
  /** It notices the target while the centre distance is at most this many px. No default. */
  sightPx: number;
  /** A step up or down this many px or less is floor it will walk on. No default. */
  stepTolerancePx: number;
};

export type ChaseResult = {
  /** The target is inside `sightPx` — both ends count. */
  noticed: boolean;
  /** The way to walk. When the centres coincide this is `self.dir`, so a pursuer does not jitter. */
  dir: -1 | 1;
  /** Signed distance between centres, target minus self, in px. Positive is to the right. */
  distancePx: number;
  /** Noticed and the ground ahead in `dir` is walkable. A hole or a NaN is never walkable. */
  walkable: boolean;
};

/**
 * Ask the ground how far it steps, one pixel ahead of the feet, in `dir`.
 *
 * Called with the direction this function is about to return, so "the way it looks" and "the way it
 * walks" cannot disagree — the bug both games had. A hole is expected as `Infinity` (either sign)
 * or `NaN`.
 */
export type GroundAhead = (dir: -1 | 1) => number;

/**
 * Decide, for one frame, which way a pursuer should walk.
 *
 * Distance is between centres, not between left edges: two boxes of different widths would
 * otherwise notice each other at distances that differ by half the width difference.
 */
export function chaseTarget(
  self: ChaseSelf,
  target: ChaseTarget,
  config: ChaseConfig,
  groundAhead: GroundAhead,
): ChaseResult {
  const distancePx = target.x + target.w / 2 - (self.x + self.w / 2);
  const dir: -1 | 1 = distancePx < 0 ? -1 : distancePx > 0 ? 1 : self.dir;
  const noticed = Math.abs(distancePx) <= config.sightPx;
  const step = groundAhead(dir);

  return {
    noticed,
    dir,
    distancePx,
    walkable: noticed && Number.isFinite(step) && Math.abs(step) <= config.stepTolerancePx,
  };
}
