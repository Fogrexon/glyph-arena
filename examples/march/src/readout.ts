/**
 * What the screen is allowed to say about a run, as pure functions.
 *
 * **This file exists because the HUD lied for a day and three people repeated it.** `hits 4 (4 from
 * behind)` was printed next to every death on 11-19, and the number behind it was
 * `player.vx > 60` — *were you running at the goal when it landed*, not *which side was the guard
 * on*. Two first-time players (宣伝, QA) and the person who wrote it all read "from behind" as a
 * fact about the guard and reported it as the cause of death; the run had `passed 0/11`, so the
 * guard was in front of them the whole time. A label that names something the code never measured
 * is worse than no label: it reads as evidence.
 *
 * So the two things the HUD says about a hit now live here, derived from one number, and a test can
 * ask them the same question the player asks: *what does this mean*.
 */

/** Which way the body was going when the heart was taken. Read from `vx`, nothing else. */
export type HitCause = "running" | "standing";

/**
 * The `vx` that separates running at the goal from standing your ground, px/s.
 *
 * It only has to be above 0 and below the walking speed, and a test derives both ends from
 * `PLAYER_RUN_PX_PER_SECOND` rather than repeating 300 here. **The knockback is larger than the
 * walking speed (320 vs 300), so the order of the two writes matters**: `hurtPlayer` reads this
 * before it overwrites `vx`, and a hit that throws you backwards can never be counted as running.
 */
export const RUNNING_CAUSE_VX = 60;

export function causeOf(vx: number): HitCause {
  return vx > RUNNING_CAUSE_VX ? "running" : "standing";
}

/** The line the death screen prints. It says what was measured and nothing about sides. */
export function hitsLine(total: number, running: number): string {
  return `hits ${total} (${running} while running)`;
}

/**
 * The controls line, in two rows because the road's lesson does not fit in one.
 *
 * Measured 11-19 with three first-time players: **all three finished their minute with
 * `passed 0/11`**. Not one of them rolled through a body, because nothing on screen said that a
 * roll is the one thing that crosses one — the old line offered `Shift roll` beside `J attack` and
 * let the player assume they were two ways to do the same thing. The cost system (the guard you go
 * by wakes the next one) was dead code for every player who never learned the verb, which was all
 * of them.
 */
export function controlsLines(): [string, string] {
  return ["A/D run · Space jump · J attack · Shift roll · touching a body hurts",
    "Shift rolls through a body — the guard you pass wakes the next one"];
}

/** A rectangle to draw at the screen edge, or `null` when the body it belongs to is already there. */
export type EdgeMark = { x: number; y: number; w: number; h: number };

/**
 * Where to draw the mark for a guard the *player* cannot see.
 *
 * A guard woken by a pass sits ahead of you at `callPartnerPx` — up to 130 px past the guard you
 * went by — and the camera puts you at 42% of a 640 px view, so he lands at 637 px: **on the last
 * column of pixels, or past it.** QA measured this exactly (woken at 774 and 870 while standing at
 * x 406: 637 px and 733 px on a 640 px view) and had to crop a screenshot to find the mark at all.
 * A cue that is off screen is not quiet, it is absent.
 *
 * So an off-screen alerted guard gets a bar in the same cream colour on the edge he is off *of*.
 * The mark stays on the body when the body is visible: two marks for one guard would read as two
 * guards.
 */
export function edgeMarkFor(
  screenX: number,
  bodyW: number,
  bodyY: number,
  bodyH: number,
  viewW: number,
): EdgeMark | null {
  if (screenX >= 0 && screenX + bodyW <= viewW) return null;
  const h = Math.min(bodyH, 24);
  return {
    x: screenX + bodyW <= 0 ? 2 : viewW - 6,
    y: bodyY + (bodyH - h) / 2,
    w: 4,
    h,
  };
}
