/**
 * The enemy's one idea: close in, then commit.
 *
 * A chaser that only walks is a wall you out-range. The lunge is what makes the fight a decision:
 * for 0.4 s it stands still and flashes (your window to hit it, or to leave), then it crosses 105 px
 * in 0.25 s at 420 px/s (your window to jump or to be hit). Hitting it during either half of the
 * commit cancels the lunge — the attack that stops an attack is the point of having one.
 *
 * Pure and here so the numbers are read by the game, the test and the tuning, all as one value.
 */
export type EnemyMode = "walk" | "windup" | "lunge" | "rest";

export const ENEMY_AI = {
  /** It notices you inside this distance (px). */
  sightPx: 260,
  /** It lunges from here. Close enough that stepping back is a real retreat. */
  lungeRangePx: 110,
  /** The tell. Long enough to react to, short enough that standing still is a mistake. */
  windupMs: 260,
  /** The commit: 105 px of travel at 420 px/s. Faster than your run (300), so the way out is up. */
  lungeMs: 250,
  lungeSpeedPxPerSecond: 420,
  /** After a lunge it is open: no second lunge for this long. */
  restMs: 420,
} as const;

/** Should a walking enemy stop and start the tell? */
export function wantsLunge(mode: EnemyMode, modeMs: number, distancePx: number, grounded: boolean): boolean {
  if (mode !== "walk") return false;
  if (!grounded) return false;
  if (modeMs < 0) return false;
  return Math.abs(distancePx) <= ENEMY_AI.lungeRangePx;
}

/**
 * A hit during the tell cancels the lunge — that is the reward for reading it. A hit *during* the
 * lunge does not: the commit has armour, or "attack" would always beat "commit" and there would be
 * nothing to read. This is the one line that makes the fight a decision instead of a damage race.
 */
export function canInterrupt(mode: EnemyMode): boolean {
  return mode === "windup";
}

/** How long the current mode has left, in ms; 0 when the mode has no timer (walk). */
export function modeRemainingMs(mode: EnemyMode, modeMs: number): number {
  const total = mode === "windup" ? ENEMY_AI.windupMs : mode === "lunge" ? ENEMY_AI.lungeMs : mode === "rest" ? ENEMY_AI.restMs : 0;
  return Math.max(0, total - modeMs);
}
