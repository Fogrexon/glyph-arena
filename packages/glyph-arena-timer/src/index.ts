export type TimerHandle = number;

export type Timer = {
  delay: (seconds: number, fn: () => void) => TimerHandle;
  every: (seconds: number, fn: () => void) => TimerHandle;
  cancel: (handle: TimerHandle) => void;
  tick: (nowSeconds: number) => void;
  dispose: () => void;
};

type Task = {
  handle: TimerHandle;
  kind: "once" | "repeat";
  fn: () => void;
  cancelled: boolean;
  nextDue: number | null;
  offsetFromOrigin: number | null;
  interval: number;
  minTickGen: number;
};

export function createTimer(): Timer {
  let disposed = false;
  let origin: number | null = null;
  let lastNow: number | null = null;
  let tickGeneration = 0;
  let nextHandle = 1;
  const tasks = new Map<TimerHandle, Task>();
  const noopHandles = new Set<TimerHandle>();

  const allocateHandle = (): TimerHandle => nextHandle++;

  const addTask = (
    seconds: number,
    fn: () => void,
    kind: "once" | "repeat",
  ): TimerHandle => {
    const handle = allocateHandle();

    if (disposed || seconds < 0) {
      noopHandles.add(handle);
      return handle;
    }

    const zeroInterval = seconds === 0;
    const task: Task = {
      handle,
      kind,
      fn,
      cancelled: false,
      nextDue: null,
      offsetFromOrigin: null,
      interval: seconds,
      minTickGen: zeroInterval ? tickGeneration + 1 : tickGeneration,
    };

    if (origin === null) {
      task.offsetFromOrigin = seconds;
    } else {
      task.nextDue = lastNow! + seconds;
    }

    tasks.set(handle, task);
    return handle;
  };

  const resolvePendingDueTimes = () => {
    if (origin === null) {
      return;
    }

    for (const task of tasks.values()) {
      if (task.nextDue === null && task.offsetFromOrigin !== null) {
        task.nextDue = origin + task.offsetFromOrigin;
        task.offsetFromOrigin = null;
      }
    }
  };

  const delay = (seconds: number, fn: () => void): TimerHandle =>
    addTask(seconds, fn, "once");

  const every = (seconds: number, fn: () => void): TimerHandle =>
    addTask(seconds, fn, "repeat");

  const cancel = (handle: TimerHandle): void => {
    if (disposed) {
      return;
    }

    if (noopHandles.has(handle)) {
      return;
    }

    const task = tasks.get(handle);
    if (task === undefined) {
      return;
    }

    task.cancelled = true;
    tasks.delete(handle);
  };

  const tick = (nowSeconds: number): void => {
    if (disposed) {
      return;
    }

    if (lastNow !== null && nowSeconds < lastNow) {
      return;
    }

    if (origin === null) {
      origin = nowSeconds;
    }

    lastNow = nowSeconds;
    tickGeneration += 1;

    resolvePendingDueTimes();

    const due: Task[] = [];
    for (const task of tasks.values()) {
      if (
        !task.cancelled &&
        task.nextDue !== null &&
        tickGeneration > task.minTickGen &&
        nowSeconds >= task.nextDue
      ) {
        due.push(task);
      }
    }

    let firstError: unknown;

    for (const task of due) {
      if (task.cancelled) {
        continue;
      }

      try {
        task.fn();
      } catch (error) {
        if (firstError === undefined) {
          firstError = error;
        }
      }

      if (task.cancelled) {
        continue;
      }

      if (task.kind === "once") {
        tasks.delete(task.handle);
      } else {
        task.nextDue = task.nextDue! + task.interval;
        if (task.interval === 0) {
          task.minTickGen = tickGeneration;
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
    delay,
    every,
    cancel,
    tick,
    dispose,
  };
}
