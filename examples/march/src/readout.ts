import { TILE } from "./level";

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
 * The controls line, and the one lesson that is only shown until it is learned.
 *
 * Measured 11-19 with three first-time players: **all three finished their minute with
 * `passed 0/11`**. Not one of them rolled through a body, because nothing on screen said that a
 * roll is the one thing that crosses one — the old line offered `Shift roll` beside `J attack` and
 * let the player assume they were two ways to do the same thing. The cost system (the guard you go
 * by wakes the next one) was dead code for every player who never learned the verb, which was all
 * of them.
 *
 * **The tell is the second verb, and it was in the same position.** Two of those three players died
 * to lunges they never interrupted: `hits 4 (4 while running)` on the run that took them from full
 * hearts to none, at the pair at x 851 — the guard's tell is 260 ms of orange and the one thing the
 * game asks you to do with it is hit him *inside* it, which cancels the lunge outright. Nothing on
 * screen said so.
 *
 * So it is a third row, and **it goes away the first time the player kills or passes somebody** —
 * by then they have met the mechanic. A hint that never leaves is scenery; a hint that leaves is a
 * lesson. `test/readout.test.ts` holds both sides of that.
 */
export function controlsLines(progress: { kills: number; passes: number }): string[] {
  const lines = [
    "A/D run · Space jump · J attack · Shift roll · touching a body hurts",
    "Shift rolls through a body — the guard you pass wakes the next one",
  ];
  if (progress.kills === 0 && progress.passes === 0) {
    lines.push("the orange flash is his tell — hit him inside it and the lunge never happens");
  }
  return lines;
}

/**
 * Where a run died, in the road's own words.
 *
 * The death screen has always said `died at x 851`, and 851 is a number with no meaning: the player
 * cannot turn it into "the pair". Measured 11-19 — 宣伝 died at 851 five times and 754 twice in one
 * minute, all of it the same pair of guards — so the line the game prints at the moment of failure
 * named a coordinate and not the thing they were fighting.
 *
 * A beat is the run of posts with a walk between them (the same grouping `test/level.test.ts`
 * derives from the layout), so the same x becomes `beat 2/5 · 2 guards`.
 */
export const BEAT_WALK_PX = 6 * TILE;

export type Beat = { index: number; count: number; size: number };

export function beatAt(x: number, posts: readonly number[]): Beat {
  const sorted = [...posts].sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const post of sorted) {
    const current = groups.at(-1);
    if (current === undefined || post - current[current.length - 1] > BEAT_WALK_PX) groups.push([post]);
    else current.push(post);
  }
  if (groups.length === 0) return { index: 1, count: 1, size: 1 };
  // The beat you are in is the last one that starts at or before you; a run that dies before the
  // first post is in the first beat, which is where the walk-in is.
  let found = 0;
  groups.forEach((group, index) => {
    if (x >= group[0]) found = index;
  });
  return { index: found + 1, count: groups.length, size: groups[found].length };
}

/** The line the death screen adds: `beat 2/5 · 2 guards`. */
export function beatLine(beat: Beat): string {
  return `beat ${beat.index}/${beat.count} · ${beat.size} guard${beat.size === 1 ? "" : "s"}`;
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
