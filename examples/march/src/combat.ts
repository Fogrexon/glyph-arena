/**
 * The attack, as numbers and pure functions.
 *
 * A hit has to feel like it happened, and each part of that is a timing: the windup is why the
 * press means something, the active window is the only time the blade is out, and the hitstop
 * freezes both bodies for a few frames so the eye catches the contact. None of it lives in the
 * renderer, so a test can read the same numbers the game does.
 *
 * The numbers are this game's taste, not the library's: reach and damage are what make the fight
 * feel one way or another, and a second game will want different ones. These are CAMP's, carried
 * over unchanged — the fight is not what MARCH changed.
 */
export type AttackPhase = "idle" | "windup" | "active" | "recovery";

export type Attack = {
  /** How long the swing has been running in ms; negative means no swing. */
  elapsedMs: number;
  /** The one enemy a single swing can hit. A swing that hits twice is a combo, not a hit. */
  hasHit: boolean;
  facing: 1 | -1;
};

/** A box with **half-open** edges: `[left, right)` × `[top, bottom)`. See `overlapsHalfOpen`. */
export type Box = { left: number; top: number; right: number; bottom: number };

export const ATTACK = {
  /** The blade comes out after this long: the press has a cost or it is not a decision. */
  windupMs: 60,
  /** The only window in which `attackBox` hits. */
  activeMs: 90,
  /** You cannot swing again until this is over. */
  recoveryMs: 150,
  /**
   * How far past your own body the blade reaches, in px.
   *
   * **This number was wrong in a way only a player could see.** A guard commits at
   * `ENEMY_AI.lungeRangePx` — 70 px, centre to centre, which is a 50 px gap between the two bodies —
   * and at 30 px the blade could not touch him from the line the game invites you to stand on. The
   * design says "the tell is your window: strike it early (cancels the lunge) or leave", and the
   * strike half was not physically available: the only way to hit a tell was to walk inside the
   * lunge first, which is the thing the tell exists to let you avoid.
   *
   * Reported by a first-time player on 11-19: three swings at range with `blade: active` on screen
   * left the guard's hp untouched; two hits landed once the gap was down to 20 px. A key that is
   * pressed and does nothing visible is not a lost fight, it is a rule nobody can see.
   *
   * 52 clears the 50 px line with 2 px to spare, so a swing begun when you see the tell arrives
   * before the lunge does — which is what the 260 ms tell was always for. `test/combat.test.ts`
   * derives the 50 from the two body widths and the lunge range instead of repeating it.
   */
  reachPx: 52,
  heightPx: 26,
  damage: 1,
  /** Enemy push on a hit, px/s. */
  knockbackPxPerSecond: 60,
  /** Both bodies stop for this long on contact. Two frames at 30 fps, four at 60. */
  hitstopMs: 70,
} as const;

const TOTAL_MS = ATTACK.windupMs + ATTACK.activeMs + ATTACK.recoveryMs;

export function beginAttack(attack: Attack, facing: 1 | -1): void {
  attack.elapsedMs = 0;
  attack.hasHit = false;
  attack.facing = facing;
}

export function stepAttack(attack: Attack, dtMs: number): void {
  if (attack.elapsedMs < 0) {
    return;
  }
  attack.elapsedMs += dtMs;
  if (attack.elapsedMs >= TOTAL_MS) {
    attack.elapsedMs = -1;
  }
}

export function attackPhase(elapsedMs: number): AttackPhase {
  if (elapsedMs < 0) return "idle";
  if (elapsedMs < ATTACK.windupMs) return "windup";
  if (elapsedMs < ATTACK.windupMs + ATTACK.activeMs) return "active";
  if (elapsedMs < TOTAL_MS) return "recovery";
  return "idle";
}

/** Where the blade is, in world px. It starts at the shoulder, not at the model's edge. */
export function attackBox(body: { x: number; y: number; w: number; h: number }, facing: 1 | -1): Box {
  const top = body.y + 2;
  const bottom = Math.min(body.y + body.h, top + ATTACK.heightPx);
  return facing === 1
    ? { left: body.x + body.w - 4, top, right: body.x + body.w + ATTACK.reachPx, bottom }
    : { left: body.x - ATTACK.reachPx, top, right: body.x + 4, bottom };
}

/**
 * Overlap for this game's boxes: **touching edges do not connect**.
 *
 * This is not `collide.overlaps`, and the difference is one character. The library's rule is closed
 * (`a.x <= b.x + b.width`), documented as "overlap or touch on an edge or corner", and pickup and
 * parry use it. This game measured its reach with the half-open rule — a blade whose tip is exactly
 * on an enemy's edge has not arrived — and the test below pins that. Swapping the two would move
 * every hit one frame earlier at the exact-touch boundary: a tuning change, not a cleanup.
 */
export function overlapsHalfOpen(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * The dodge: a roll with a short window you cannot be hit in.
 *
 * It exists because of a measurement, not a feeling. With three enemies committed into one window
 * the careful play had no answer — it retreated from every tell and never got a window of its own
 * (28 tells, 0 kills, sixty seconds). Attack and jump answer "hit it" and "leave"; neither answers
 * "it is already on me". A roll is the third answer, and it is a *commitment*: it locks steering
 * for its whole length, so spending it early is a mistake.
 *
 * The invulnerable window is shorter than the roll. That is the taste: you are buying the crossing,
 * not immunity, and a roll that is still going when the window ends is a roll that can be caught.
 *
 * MARCH uses this twice: the window stops damage, and the roll crosses a body (see `main.ts`).
 */
export const DODGE = {
  /** How long the roll carries you, in ms. */
  durationMs: 180,
  /** How fast, px/s. Above the 300 px/s run — the point is to cross the commit, not to walk. */
  speedPxPerSecond: 520,
  /** The window where the commit cannot touch you, in ms. Shorter than the roll, on purpose. */
  invulnerableMs: 140,
  /** You cannot roll again until this is over, in ms. */
  cooldownMs: 420,
} as const;

export type Dodge = {
  /** How long the roll has been running in ms; negative means not rolling. */
  elapsedMs: number;
  /** Time left before another roll, in ms. */
  cooldownMs: number;
  facing: 1 | -1;
};

export function beginDodge(dodge: Dodge, facing: 1 | -1): void {
  dodge.elapsedMs = 0;
  dodge.facing = facing;
  dodge.cooldownMs = DODGE.cooldownMs;
}

export function stepDodge(dodge: Dodge, dtMs: number): void {
  if (dodge.elapsedMs >= 0) {
    dodge.elapsedMs += dtMs;
    if (dodge.elapsedMs >= DODGE.durationMs) {
      dodge.elapsedMs = -1;
    }
  }
  dodge.cooldownMs = Math.max(0, dodge.cooldownMs - dtMs);
}

/** Rolling right now? Steering is locked for exactly this long. */
export function dodgeRolling(elapsedMs: number): boolean {
  return elapsedMs >= 0 && elapsedMs < DODGE.durationMs;
}

/** Can the commit touch you? Only inside the first `invulnerableMs` of a roll. */
export function dodgeInvulnerable(elapsedMs: number): boolean {
  return elapsedMs >= 0 && elapsedMs < DODGE.invulnerableMs;
}

/** Ready for a new roll: not rolling, and the cooldown is spent. */
export function dodgeReady(dodge: Dodge): boolean {
  return dodge.elapsedMs < 0 && dodge.cooldownMs <= 0;
}
