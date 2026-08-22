export type Time = {
  elapsed: number;
  delta: number;
  frame: number;
};

export type Clock = () => number;

export type RafCallback = (time: number) => void;

export type Raf = (callback: RafCallback) => number;

export type CancelRaf = (handle: number) => void;

export type LoopOptions = {
  onFrame: (time: Time) => void;
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
    const delta = frame === 0 ? 0 : (now - lastTime) / 1000;
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
