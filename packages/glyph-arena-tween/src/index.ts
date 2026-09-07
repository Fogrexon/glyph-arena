export type TweenHandle = number;

export type Tween = {
  to: (
    from: number,
    to: number,
    durationSeconds: number,
    ease?: (t: number) => number,
  ) => TweenHandle;
  get: (handle: TweenHandle) => number | undefined;
  cancel: (handle: TweenHandle) => void;
  tick: (nowSeconds: number) => void;
  dispose: () => void;
};

type TweenTask = {
  handle: TweenHandle;
  from: number;
  to: number;
  duration: number;
  ease: (t: number) => number;
  startTime: number | null;
  offsetFromOrigin: number | null;
  minTickGen: number;
};

const identity = (t: number): number => t;

const clamp01 = (t: number): number => Math.min(Math.max(t, 0), 1);

export function createTween(): Tween {
  let disposed = false;
  let origin: number | null = null;
  let lastNow: number | null = null;
  let tickGeneration = 0;
  let nextHandle = 1;
  const tasks = new Map<TweenHandle, TweenTask>();
  const noopHandles = new Set<TweenHandle>();

  const allocateHandle = (): TweenHandle => nextHandle++;

  const resolveStartTimes = (): void => {
    if (origin === null) {
      return;
    }

    for (const task of tasks.values()) {
      if (task.startTime === null && task.offsetFromOrigin !== null) {
        task.startTime = origin + task.offsetFromOrigin;
        task.offsetFromOrigin = null;
      }
    }
  };

  const isZeroDurationPending = (task: TweenTask): boolean =>
    task.duration === 0 && tickGeneration <= task.minTickGen;

  const isComplete = (task: TweenTask, nowSeconds: number): boolean => {
    if (task.startTime === null) {
      return false;
    }

    if (task.duration === 0) {
      return tickGeneration > task.minTickGen;
    }

    return nowSeconds >= task.startTime + task.duration;
  };

  const computeValue = (task: TweenTask, nowSeconds: number): number => {
    if (task.startTime === null || isZeroDurationPending(task)) {
      return Number.NaN;
    }

    const elapsed = nowSeconds - task.startTime;
    const u = clamp01(elapsed / task.duration);
    return task.from + (task.to - task.from) * task.ease(u);
  };

  const removeTask = (handle: TweenHandle): void => {
    tasks.delete(handle);
  };

  const to = (
    from: number,
    toValue: number,
    durationSeconds: number,
    ease?: (t: number) => number,
  ): TweenHandle => {
    const handle = allocateHandle();

    if (disposed || durationSeconds < 0) {
      noopHandles.add(handle);
      return handle;
    }

    const zeroDuration = durationSeconds === 0;
    const task: TweenTask = {
      handle,
      from,
      to: toValue,
      duration: durationSeconds,
      ease: ease ?? identity,
      startTime: null,
      offsetFromOrigin: null,
      minTickGen: zeroDuration ? tickGeneration + 1 : tickGeneration,
    };

    if (origin === null) {
      task.offsetFromOrigin = 0;
    } else {
      task.startTime = lastNow!;
    }

    tasks.set(handle, task);
    return handle;
  };

  const get = (handle: TweenHandle): number | undefined => {
    if (disposed || lastNow === null) {
      return undefined;
    }

    if (noopHandles.has(handle)) {
      return undefined;
    }

    const task = tasks.get(handle);
    if (task === undefined) {
      return undefined;
    }

    if (isZeroDurationPending(task)) {
      return undefined;
    }

    if (isComplete(task, lastNow)) {
      return undefined;
    }

    try {
      return computeValue(task, lastNow);
    } catch (error) {
      removeTask(handle);
      throw error;
    }
  };

  const cancel = (handle: TweenHandle): void => {
    if (disposed) {
      return;
    }

    if (noopHandles.has(handle)) {
      return;
    }

    if (!tasks.has(handle)) {
      return;
    }

    removeTask(handle);
  };

  const tick = (nowSeconds: number): void => {
    if (disposed) {
      return;
    }

    if (lastNow !== null && nowSeconds < lastNow) {
      return;
    }

    if (lastNow !== null && nowSeconds === lastNow) {
      return;
    }

    if (origin === null) {
      origin = nowSeconds;
    }

    lastNow = nowSeconds;
    tickGeneration += 1;

    resolveStartTimes();

    let firstError: unknown;

    for (const task of [...tasks.values()]) {
      if (!tasks.has(task.handle)) {
        continue;
      }

      try {
        if (isComplete(task, nowSeconds)) {
          removeTask(task.handle);
          continue;
        }

        computeValue(task, nowSeconds);
      } catch (error) {
        removeTask(task.handle);
        if (firstError === undefined) {
          firstError = error;
        }
      }
    }

    if (firstError !== undefined) {
      throw firstError;
    }
  };

  const dispose = (): void => {
    if (disposed) {
      return;
    }

    disposed = true;
    tasks.clear();
    noopHandles.clear();
  };

  return {
    to,
    get,
    cancel,
    tick,
    dispose,
  };
}
