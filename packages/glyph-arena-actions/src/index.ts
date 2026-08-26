export type ActionQuery = {
  down: (action: string) => boolean;
  pressed: (action: string) => boolean;
  released: (action: string) => boolean;
};

export type Actions = {
  bind: (action: string, codes: readonly string[]) => void;
  unbind: (action: string) => void;
  tick: (keys: Iterable<string>) => ActionQuery;
  dispose: () => void;
};

const EMPTY_QUERY: ActionQuery = {
  down: () => false,
  pressed: () => false,
  released: () => false,
};

function createSnapshot(
  down: ReadonlyMap<string, boolean>,
  pressed: ReadonlyMap<string, boolean>,
  released: ReadonlyMap<string, boolean>,
): ActionQuery {
  return {
    down(action: string) {
      return down.get(action) ?? false;
    },
    pressed(action: string) {
      return pressed.get(action) ?? false;
    },
    released(action: string) {
      return released.get(action) ?? false;
    },
  };
}

function isDown(codes: readonly string[], keys: ReadonlySet<string>): boolean {
  if (codes.length === 0) {
    return false;
  }

  for (const code of codes) {
    if (keys.has(code)) {
      return true;
    }
  }

  return false;
}

export function createActions(): Actions {
  let disposed = false;
  const bindings = new Map<string, readonly string[]>();
  const lastDown = new Map<string, boolean>();

  const bind = (action: string, codes: readonly string[]): void => {
    if (disposed) {
      return;
    }

    bindings.set(action, codes);
  };

  const unbind = (action: string): void => {
    if (disposed) {
      return;
    }

    if (!bindings.has(action)) {
      return;
    }

    bindings.delete(action);
  };

  const tick = (keys: Iterable<string>): ActionQuery => {
    if (disposed) {
      return EMPTY_QUERY;
    }

    const keySet = new Set(keys);
    const down = new Map<string, boolean>();
    const pressed = new Map<string, boolean>();
    const released = new Map<string, boolean>();

    for (const [action, codes] of bindings) {
      const isActionDown = isDown(codes, keySet);
      const wasDown = lastDown.get(action) ?? false;

      down.set(action, isActionDown);

      if (isActionDown && !wasDown) {
        pressed.set(action, true);
      }

      if (!isActionDown && wasDown) {
        released.set(action, true);
      }

      lastDown.set(action, isActionDown);
    }

    for (const [action, wasDown] of lastDown) {
      if (!bindings.has(action) && wasDown) {
        released.set(action, true);
        lastDown.set(action, false);
      }
    }

    return createSnapshot(down, pressed, released);
  };

  const dispose = (): void => {
    if (disposed) {
      return;
    }

    disposed = true;
    bindings.clear();
    lastDown.clear();
  };

  return {
    bind,
    unbind,
    tick,
    dispose,
  };
}
