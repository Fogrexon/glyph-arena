/**
 * The runner's body — now the library's body, with this game's numbers.
 *
 * `@fogrexon/glyph-arena-body` owns gravity, acceleration, the jump with coyote time and an
 * input buffer, and axis-separated resolution against a `solid` query. It has **no numbers and no
 * grid of its own** (its charter), so everything a player feels is configured here and the tile
 * size is only passed in as `grid`.
 *
 * This file used to be 110 lines of that logic with `32` in three places. The exports keep their
 * old names so `main.ts` and the tests read the same functions as before: a refactor that renames
 * call sites hides whether the behaviour survived.
 */
import {
  createBody as createBodyOf,
  jumpHeightOf,
  stepBody as stepBodyOf,
  type Body,
  type BodyConfig,
  type SolidQuery,
} from "@fogrexon/glyph-arena-body";

import { TILE } from "./level";

export type { Body, SolidQuery };

/** Every number the runner feels. 760 / 2600 / 0.09 / 0.12 are this game's feel, not defaults. */
export const CONFIG: BodyConfig = {
  gravity: 2600,
  jumpVelocity: -760,
  maxFall: 1200,
  coyoteSeconds: 0.09,
  jumpBufferSeconds: 0.12,
  runSpeed: 320,
  runAccel: 2600,
  airAccel: 1700,
  groundFriction: 2400,
  airFriction: 400,
  // How much of the rise a released jump keeps. This is feel, so it lives here, not in the package.
  jumpCutFactor: 0.35,
};

// The spec and the acceptance tests quote these names, so they stay one hop from the config.
export const GRAVITY = CONFIG.gravity;
export const JUMP_VELOCITY = CONFIG.jumpVelocity;
export const MAX_FALL = CONFIG.maxFall;
export const COYOTE_SECONDS = CONFIG.coyoteSeconds;
export const JUMP_BUFFER_SECONDS = CONFIG.jumpBufferSeconds;
export const MAX_RUN = CONFIG.runSpeed;

export function createBody(x: number, y: number, w = 20, h = 28): Body {
  return createBodyOf({ x, y, w, h }, CONFIG);
}

/** How high a jump from rest reaches, in px. Computed from the same config the step uses. */
export function jumpHeight(): number {
  return jumpHeightOf(CONFIG);
}

/**
 * One step. `jumpPressed` is the edge, `jumpHeld` is whether the key is still down.
 * `grid: TILE` keeps the old behaviour: a blocked move stops on the tile edge rather than
 * somewhere inside it, which is what the old hand-written resolution did with `32` inlined.
 */
export function stepBody(
  body: Body,
  input: { left: boolean; right: boolean; jumpPressed: boolean; jumpHeld: boolean },
  dt: number,
  solid: SolidQuery,
): void {
  stepBodyOf(
    body,
    { left: input.left, right: input.right, jump: input.jumpPressed, jumpHeld: input.jumpHeld },
    dt,
    solid,
    { grid: TILE },
  );
}
