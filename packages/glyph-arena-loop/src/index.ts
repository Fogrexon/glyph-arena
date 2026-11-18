export type Time = {
  /**
   * Real time since `start()`, in seconds. **Not** clamped: a background tab
   * still shows the time that actually passed.
   */
  elapsed: number;
  /**
   * Simulation-safe step for this frame, in seconds: the real gap, capped at
   * `maxDelta` (0.1 s unless the loop was told otherwise).
   */
  delta: number;
  frame: number;
};

/**
 * Largest step a frame may report by default, in seconds.
 *
 * Returning to a backgrounded tab hands the animation frame a multi-second
 * gap; passing that through made a single step advance a whole round. 0.1 s is
 * chosen against the collision sizes: the fastest thing in the demo moves
 * 360 px/s, so one step covers 36 px — less than a player (28) plus a hazard
 * (32) = 60 px, so a step cannot tunnel two boxes past each other. **If the
 * player or hazard size shrinks, this cap has to be revisited** (60 px is what
 * makes 36 px safe). `elapsed` is deliberately not clamped, so `Σdelta ≠
 * elapsed` right after a stall — that is the intended trade.
 *
 * A game whose own numbers want a smaller step passes `maxDelta`; see there.
 */
const DEFAULT_MAX_DELTA_SECONDS = 0.1;

export type Clock = () => number;

export type RafCallback = (time: number) => void;

export type Raf = (callback: RafCallback) => number;

export type CancelRaf = (handle: number) => void;

export type LoopOptions = {
  onFrame: (time: Time) => void;
  /**
   * The largest step `delta` may report, in seconds. Defaults to 0.1.
   *
   * This is the game's step, not the frame: a body that moves 800 px/s wants a
   * smaller step than one that moves 360, and every sample used to write
   * `Math.min(time.delta, …)` at the top of `onFrame` — which is the loop's
   * clamp, written again, one frame later. Passing the number here means the
   * `delta` a `onFrame` receives *is* the step the world sees.
   *
   * Only `delta` is clamped. `elapsed` keeps reporting the real time, so the
   * `Σdelta ≠ elapsed` trade above is unchanged.
   *
   * `0`, negative and non-finite values are refused at construction: a zero
   * step is a game that silently never moves, and the constructor is the last
   * place where that is still visible.
   *
   * Values above 0.1 are allowed and are the caller's tunnelling risk — the
   * page above is what 0.1 is safe against for the demo's sizes.
   */
  maxDelta?: number;
  clock?: Clock;
  raf?: Raf;
  cancelRaf?: CancelRaf;
};

export type Loop = {
  start: () => void;
  stop: () => void;
  isRunning: boolean;
};

export function createLoop(options: LoopOptions): Loop {
  const maxDelta = options.maxDelta ?? DEFAULT_MAX_DELTA_SECONDS;
  if (!Number.isFinite(maxDelta) || maxDelta <= 0) {
    throw new RangeError(`maxDelta must be a finite number of seconds above 0, got ${maxDelta}`);
  }

  const clock = options.clock ?? (() => globalThis.performance.now());
  const raf =
    options.raf ??
    ((cb: RafCallback) => globalThis.requestAnimationFrame(cb));
  const cancelRaf = options.cancelRaf;

  let isRunning = false;
  let startTime = 0;
  let lastTime = 0;
  let frame = 0;
  let rafHandle: number | null = null;

  const tick = () => {
    if (!isRunning) {
      return;
    }

    const now = clock();
    const elapsed = (now - startTime) / 1000;
    const realDelta = (now - lastTime) / 1000;
    // A backwards clock (or a NaN) must not produce a negative step.
    const delta =
      frame === 0
        ? 0
        : Math.min(Math.max(realDelta, 0), maxDelta);
    lastTime = now;

    const time: Time = { elapsed, delta, frame };

    try {
      options.onFrame(time);
    } catch (error) {
      isRunning = false;
      rafHandle = null;
      throw error;
    }

    frame += 1;

    if (isRunning) {
      rafHandle = raf(tick);
    }
  };

  return {
    get isRunning() {
      return isRunning;
    },

    start() {
      if (isRunning) {
        return;
      }

      isRunning = true;
      startTime = clock();
      lastTime = startTime;
      frame = 0;
      rafHandle = raf(tick);
    },

    stop() {
      if (!isRunning) {
        return;
      }

      isRunning = false;

      if (rafHandle !== null && cancelRaf !== undefined) {
        cancelRaf(rafHandle);
        rafHandle = null;
      }
    },
  };
}
