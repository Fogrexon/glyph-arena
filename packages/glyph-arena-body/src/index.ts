/**
 * A platformer body: gravity, a run with acceleration, a jump with coyote time and an input
 * buffer, and axis-separated resolution against a solid test the caller supplies.
 *
 * Two things this package deliberately does **not** have:
 *
 * - **No numbers of its own.** There is no default `gravity`, no preset, no `TILE`. Every value
 *   comes from the caller's `BodyConfig`, because "760 / 2600" is this game's feel, not the
 *   library's. A default here would silently become the next game's feel.
 * - **No grid.** The body asks `solid(left, top, right, bottom)` and nothing else. When the caller
 *   passes `{ grid }`, a blocked move snaps to that cell boundary; without it the move is simply
 *   reverted. The tile size stays in the game.
 *
 * `grounded` is recomputed from the collision result every step and never carried over: a body
 * that walks off a ledge is not grounded on the frame it leaves, no matter what it believed
 * before.
 */

export type BodyConfig = {
  /** Downward acceleration in px/s². `0` means no gravity at all, not "use a default". */
  gravity: number;
  /** Vertical velocity applied by a jump, in px/s. Negative is up, matching canvas y. */
  jumpVelocity: number;
  /** Terminal fall speed in px/s. */
  maxFall: number;
  /** Seconds after leaving the ground in which a jump still counts. */
  coyoteSeconds: number;
  /** Seconds a jump press is remembered while the body cannot jump yet. */
  jumpBufferSeconds: number;
  /** Horizontal speed a run reaches, in px/s. */
  runSpeed: number;
  /** Horizontal acceleration on the ground, in px/s². */
  runAccel: number;
  /** Horizontal acceleration in the air, in px/s². */
  airAccel: number;
  /** Deceleration with no horizontal input on the ground, in px/s². */
  groundFriction: number;
  /** Deceleration with no horizontal input in the air, in px/s². */
  airFriction: number;
  /**
   * What is left of an upward velocity when the jump is released early, as a fraction.
   * Default `0.35` — a variable jump, so holding the button is worth more height.
   */
  jumpCutFactor?: number;
};

/** One frame of intent. `jump` is the press (an edge), `jumpHeld` is whether it is still down. */
export type BodyInput = {
  left?: boolean;
  right?: boolean;
  jump?: boolean;
  jumpHeld?: boolean;
};

/**
 * "Is this box solid?" The box is left/top/right/bottom in world units. Called at most twice per
 * axis per step.
 */
export type SolidQuery = (
  left: number,
  top: number,
  right: number,
  bottom: number,
) => boolean;

export type Body = {
  /** The config this body was made with. `stepBody` reads it here so every call site cannot pass a different one. */
  readonly config: BodyConfig;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  /** Landed on the last step. Recomputed every step; never carried over. */
  grounded: boolean;
  /** Seconds of coyote time left. */
  coyote: number;
  /** Seconds of buffered jump press left. */
  jumpBuffer: number;
  /** Whether the jump was held on the previous step, so the release can be detected. */
  jumpHeld: boolean;
};

export type StepOptions = {
  /** Cell size in world units. When given, a blocked move snaps to the cell boundary. */
  grid?: number;
};

export type Box = { x: number; y: number; w: number; h: number };

const DEFAULT_JUMP_CUT = 0.35;

const clampToZero = (value: number): number => (value < 0 ? 0 : value);

const moveTowards = (from: number, to: number, maxDelta: number): number => {
  if (from < to) return Math.min(from + maxDelta, to);
  if (from > to) return Math.max(from - maxDelta, to);
  return to;
};

export function createBody(box: Box, config: BodyConfig): Body {
  return {
    config,
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    vx: 0,
    vy: 0,
    grounded: false,
    coyote: 0,
    jumpBuffer: 0,
    jumpHeld: false,
  };
}

/**
 * How high a jump from `config` reaches, in px: `v² / 2g`. Games quote this number in their specs
 * and acceptance runs quote it back, so it is computed here from the same config the step uses
 * instead of being written down a second time.
 */
export function jumpHeightOf(config: BodyConfig): number {
  if (config.gravity <= 0) return 0;

  return (config.jumpVelocity * config.jumpVelocity) / (2 * config.gravity);
}

function boxAt(body: Body, x: number, y: number): [number, number, number, number] {
  return [x, y, x + body.w, y + body.h];
}

function blocked(body: Body, solid: SolidQuery, x: number, y: number): boolean {
  const [left, top, right, bottom] = boxAt(body, x, y);

  return solid(left, top, right, bottom);
}

/**
 * The cell boundary a blocked move should stop on. `next` is the position the move was heading
 * for, not the position it started from: snapping from the start can jump the body *backwards*
 * (a landing at y = 273 with a 32 px grid snapped to 260, 13 px up and through the floor it was
 * falling toward).
 */
function snapAxis(
  next: number,
  size: number,
  velocity: number,
  grid: number,
): number {
  if (velocity > 0) return Math.floor((next + size) / grid) * grid - size;

  return Math.ceil(next / grid) * grid;
}

/**
 * Advance one body by `dt` seconds.
 *
 * Order is horizontal, then vertical, each resolved separately against `solid` — the usual reason
 * a platformer body catches on a floor seam is resolving both axes at once, so the two are kept
 * apart on purpose. `grounded` is set from what the vertical move actually hit.
 */
export function stepBody(
  body: Body,
  input: BodyInput,
  dt: number,
  solid: SolidQuery,
  options: StepOptions = {},
): void {
  if (!Number.isFinite(dt) || dt <= 0) return;

  const { config } = body;

  const wasHeld = body.jumpHeld;
  body.jumpHeld = input.jumpHeld === true;

  // Timers first: a jump pressed this step may be spent by a landing this step.
  body.coyote = body.grounded ? config.coyoteSeconds : clampToZero(body.coyote - dt);
  body.jumpBuffer = input.jump === true ? config.jumpBufferSeconds : clampToZero(body.jumpBuffer - dt);

  // A jump released while still rising is cut once, which is what makes the jump variable.
  if (!wasHeld && body.jumpHeld) {
    // fresh press; nothing to cut
  } else if (!body.jumpHeld && body.vy < 0 && wasHeld) {
    body.vy *= config.jumpCutFactor ?? DEFAULT_JUMP_CUT;
  }

  // Horizontal: accelerate toward the run speed, or decelerate with no input.
  const direction = (input.right === true ? 1 : 0) - (input.left === true ? 1 : 0);
  const accel = body.grounded ? config.runAccel : config.airAccel;
  const friction = body.grounded ? config.groundFriction : config.airFriction;

  body.vx =
    direction === 0
      ? moveTowards(body.vx, 0, friction * dt)
      : moveTowards(body.vx, direction * config.runSpeed, accel * dt);

  // Jump: a buffered press spends a coyote window.
  if (body.jumpBuffer > 0 && body.coyote > 0) {
    body.vy = config.jumpVelocity;
    body.jumpBuffer = 0;
    body.coyote = 0;
    body.grounded = false;
  }

  // Gravity, then terminal velocity.
  body.vy = Math.min(body.vy + config.gravity * dt, config.maxFall);

  // --- horizontal move -----------------------------------------------------
  const nextX = body.x + body.vx * dt;
  if (blocked(body, solid, nextX, body.y)) {
    if (options.grid === undefined) {
      body.x = body.x;
    } else {
      const snapped = snapAxis(nextX, body.w, body.vx, options.grid);
      // Never snap backwards through the space the body is already standing in.
      body.x = body.vx > 0 ? Math.max(body.x, snapped) : Math.min(body.x, snapped);
    }
    body.vx = 0;
  } else {
    body.x = nextX;
  }

  // --- vertical move -------------------------------------------------------
  const nextY = body.y + body.vy * dt;
  const landed = body.vy > 0;
  if (blocked(body, solid, body.x, nextY)) {
    if (options.grid === undefined) {
      body.y = body.y;
    } else {
      const snapped = snapAxis(nextY, body.h, body.vy, options.grid);
      body.y = body.vy > 0 ? Math.max(body.y, snapped) : Math.min(body.y, snapped);
    }
    body.vy = 0;
    body.grounded = landed;
  } else {
    body.y = nextY;
    body.grounded = false;
  }

  if (body.grounded) body.coyote = config.coyoteSeconds;
}
