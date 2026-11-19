/**
 * The enemy's one idea: close in, then commit.
 *
 * A chaser that only walks is a wall you out-range. The lunge is what makes the fight a decision:
 * for 0.4 s it stands still and flashes (your window to hit it, or to leave), then it crosses 105 px
 * in 0.25 s at 420 px/s (your window to jump or to be hit). Hitting it during either half of the
 * commit cancels the lunge — the attack that stops an attack is the point of having one.
 *
 * Pure and here so the numbers are read by the game, the test and the tuning, all as one value.
 *
 * These are CAMP's numbers, unchanged and deliberately so: MARCH asks a new question about the shape
 * around the fight (see `main.ts` and the README), not about the fight itself, and the fight was
 * measured across five units. Where MARCH differs is in `main.ts`, not here.
 */
export type EnemyMode = "walk" | "windup" | "lunge" | "rest";

export const ENEMY_AI = {
  /** It notices you inside this distance (px). */
  sightPx: 260,
  /**
   * It lunges from here. Close enough that stepping back is a real retreat, far enough that a spot
   * outside it exists at all: the commit covers 138 px, so a 110 px trigger made every place you
   * could stand a place the lunge reached.
   */
  lungeRangePx: 70,
  /** The tell. Long enough to react to, short enough that standing still is a mistake. */
  windupMs: 260,
  /** The commit: 300 ms at 460 px/s — 138 px, which is why the way out has to start at the tell. */
  lungeMs: 300,
  lungeSpeedPxPerSecond: 460,
  /**
   * After a lunge it is open: no second lunge for this long. Measured: at 300 ms the window could
   * not be used from outside the commit — reversing the retreat alone costs 125 ms and the swing
   * is 300 ms, so the reward for reading the tell was a window nobody could step into. The number
   * has to outlast the commitment it asks for.
   */
  restMs: 450,
  /**
   * No two enemies begin a commit inside this window of each other.
   *
   * The constraint was never the average. Measured with three in sight: the interval between one
   * lunge starting and the next was median 1900 ms but **min 116 ms**, and 116 ms is shorter than
   * the 180 ms the roll locks steering for — so no verb could answer the second one. That is not a
   * hard fight, it is an unanswerable one. Spacing the commits moves the second tell far enough
   * that the answer exists again; it is the queue, not the individual enemy, that was unfair.
   *
   * Read by the game through `canCommit`; the value belongs to this game, not to a library.
   */
  commitSpacingMs: 300,
} as const;

/**
 * Is the way clear to begin a commit? One enemy may start a tell only if nobody else started one
 * inside `commitSpacingMs`.
 *
 * `lastCommitMs` is the clock reading of the most recent commit by anyone (the game starts it at
 * `-Infinity`, so the first enemy is always free). Pure, so the rule can be tested without a fight.
 */
export function canCommit(nowMs: number, lastCommitMs: number): boolean {
  return nowMs - lastCommitMs >= ENEMY_AI.commitSpacingMs;
}

/** Should a walking enemy stop and start the tell? */
export function wantsLunge(mode: EnemyMode, modeMs: number, distancePx: number, grounded: boolean): boolean {
  if (mode !== "walk") return false;
  if (!grounded) return false;
  if (modeMs < 0) return false;
  return Math.abs(distancePx) <= ENEMY_AI.lungeRangePx;
}

/**
 * A hit during the first half of the tell cancels the lunge — that is the reward for reading it.
 * After the halfway point the tell is armoured too, and so is the lunge.
 *
 * Measured on 11-18: with the whole tell cancellable, a bot that never stops swinging cancelled
 * every single tell (`tells 4 lunges 0`, seven seconds, no damage) and that made mashing strictly
 * better than reading — no choice, just a correct answer. Half a tell is one decision long: strike
 * the tell early, or leave. Standing still and swinging late is the one losing move.
 */
export function canInterrupt(mode: EnemyMode, modeMs: number): boolean {
  return mode === "windup" && modeMs < ENEMY_AI.windupMs / 2;
}

/** How long the current mode has left, in ms; 0 when the mode has no timer (walk). */
export function modeRemainingMs(mode: EnemyMode, modeMs: number): number {
  const total = mode === "windup" ? ENEMY_AI.windupMs : mode === "lunge" ? ENEMY_AI.lungeMs : mode === "rest" ? ENEMY_AI.restMs : 0;
  return Math.max(0, total - modeMs);
}
