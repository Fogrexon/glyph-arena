/**
 * The attack, as numbers and pure functions.
 *
 * A hit has to feel like it happened, and each part of that is a timing: the windup is why the
 * press means something, the active window is the only time the blade is out, and the hitstop
 * freezes both bodies for a few frames so the eye catches the contact. None of it lives in the
 * renderer, so a test can read the same numbers the game does.
 *
 * The numbers are this game's taste, not the library's: reach and damage are what make the fight
 * feel one way or another, and a second game will want different ones.
 */
export type AttackPhase = "idle" | "windup" | "active" | "recovery";

export type Attack = {
  /** How long the swing has been running in ms; negative means no swing. */
  elapsedMs: number;
  /** The one enemy a single swing can hit. A swing that hits twice is a combo, not a hit. */
  hasHit: boolean;
  facing: 1 | -1;
};

export type Box = { left: number; top: number; right: number; bottom: number };

export const ATTACK = {
  /** The blade comes out after this long: the press has a cost or it is not a decision. */
  windupMs: 60,
  /** The only window in which `attackBox` hits. */
  activeMs: 90,
  /** You cannot swing again until this is over. */
  recoveryMs: 150,
  reachPx: 30,
  heightPx: 26,
  damage: 1,
  /** Enemy push on a hit, px/s. */
  knockbackPxPerSecond: 140,
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

export function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}
