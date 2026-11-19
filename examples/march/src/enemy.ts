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
  /**
   * How fast a guard walks back to his post after a commit, px/s.
   *
   * The lunge moves the body 138 px and, until this existed, the body stayed where the lunge left
   * it: measured on 11-19, a player who only held right carried the first guard's post 454 → 329 →
   * 204 → 79 and was killed at the spawn wall in 4.2 s without a decision being taken — the road
   * under him was being rewritten by the guard he was trying to get past. A commit is a step out,
   * not a move, so he steps back. At the player's own 300 px/s the walk home cannot be chased down,
   * so it costs the fight nothing: the window after the lunge is still the window.
   */
  returnPxPerSecond: 300,
  /**
   * How fast a guard **you walked past** follows you, px/s.
   *
   * Passing a guard used to cost nothing at all: he kept his post and the road behind you was
   * empty, so "run and never swing" cleared the whole road in 15.0 s with one heart lost — faster
   * than fighting, and safer, which is not a choice (measured on 11-19, three players: 15.0 s by
   * running, 28.5 s by fighting). A guard who has been walked past now turns and follows.
   *
   * 330 is `PLAYER_RUN_PX_PER_SECOND` + 30: he closes the gap at 30 px/s, which over one beat is
   * nothing and over a road is a decision. **He chases while you are within `sightPx`** — get 260 px
   * away and he gives up and walks back to his post — and **one commit is all he gets**: after it he
   * is spent and returns, so a guard can cost at most one heart in a run and eleven guards cannot
   * become eleven hits.
   */
  chaseSpeedPxPerSecond: 330,
  /**
   * How far out a **called** guard commits, px.
   *
   * Passing a guard used to cost one chase, and a chase is answerable with the roll you already
   * spent to pass him. Measured on 11-19: the mixed line (roll the singles, fight the pairs) cleared
   * the road in 41–52 s with **no hits at all**, faster than the careful 65–73 s and just as
   * untouched — so going by still cost nothing, and the road had one best line rather than a choice.
   *
   * A guard who has been passed now **shouts ahead**: the next guard you will meet wakes, and
   * commits from 190 px instead of 70. He is not aiming at where you stood — 190 is 52 px past his
   * 138 px commit — he is lunging **into the road**, so the thing you arrive at is a body across it
   * with your roll still cooling down. That is the cost of going by: not a heart, a spent verb.
   */
  alertRangePx: 190,
  /**
   * Two posts closer than this are a pair, so a call wakes both halves of one.
   *
   * The road's pairs stand 96 px apart (and its triples 64); the next beat is 320–448 away. This is
   * the separation, not a tuning: `scripts/march-call.test.mjs` derives both edges from `level.ts`.
   */
  callPartnerPx: 130,
  /**
   * How long a called guard announces himself, ms.
   *
   * The mark that says "this one is awake" is a price, and a price nobody reads is not a price: a
   * 2 x 7 px bar above a 20 x 44 px body is visible only if you already know to look. For the first
   * 600 ms after the call he wears it **wide and bright**, then settles into the quiet bar for the
   * rest of the alert. 600 is long enough to survive a glance and short enough that it never becomes
   * scenery: at 300 px/s you cover 180 px inside it, which is one beat's walk.
   */
  alertFlashMs: 600,
} as const;

/**
 * Who hears a guard who has just been passed.
 *
 * The shout goes **forward**: the next post ahead wakes, and anyone standing close enough to be that
 * guard's partner wakes with him (a pair that arrives one at a time is two singles, which is the
 * thing the pairs exist to not be). Everyone else stays asleep — a call that reached the whole road
 * would be a difficulty dial, and the point is a price attached to one decision.
 *
 * Pure, and in posts rather than bodies, so it can be read without a fight: a body is where a lunge
 * left it, a post is where the guard lives.
 */
export function calledBy(posts: readonly number[], passedPost: number, partnerPx: number): number[] {
  const ahead = posts.filter((post) => post > passedPost).sort((a, b) => a - b);
  if (ahead.length === 0) return [];
  const next = ahead[0];
  return posts.filter((post) => Math.abs(post - next) < partnerPx);
}

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

/**
 * One step of a guard walking back to the post he committed from.
 *
 * Pure so the rule can be read without a fight: the commit is a step out, and the step back covers
 * the same ground in the other direction, ending **exactly** on the post rather than near it — a
 * guard who stops 0.3 px short is a guard who is, by his own trigger, off his post forever.
 */
export function stepToPost(x: number, homeX: number, speedPxPerSecond: number, dtSeconds: number): number {
  const delta = homeX - x;
  const step = speedPxPerSecond * dtSeconds;
  if (Math.abs(delta) <= step) return homeX;
  return x + Math.sign(delta) * step;
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
