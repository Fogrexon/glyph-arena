export type PointerState = {
  id: number;
  x: number;
  y: number;
  buttons: number;
};

export type InputSnapshot = {
  keys: ReadonlySet<string>;
  pointers: readonly PointerState[];
};

export type Input = {
  attach: (target: EventTarget) => void;
  detach: () => void;
  snapshot: () => InputSnapshot;
  dispose: () => void;
};

const EMPTY_KEYS: ReadonlySet<string> = new Set<string>();
const EMPTY_POINTERS: readonly PointerState[] = [];

export function createInput(): Input {
  let target: EventTarget | null = null;
  let disposed = false;
  const keys = new Set<string>();
  const pointers = new Map<number, PointerState>();

  const clearState = () => {
    keys.clear();
    pointers.clear();
  };

  const onKeyDown = (event: Event) => {
    if (event instanceof KeyboardEvent) {
      keys.add(event.code);
    }
  };

  const onKeyUp = (event: Event) => {
    if (event instanceof KeyboardEvent) {
      keys.delete(event.code);
    }
  };

  const onPointerDown = (event: Event) => {
    if (event instanceof PointerEvent) {
      pointers.set(event.pointerId, {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        buttons: event.buttons,
      });
    }
  };

  const onPointerMove = (event: Event) => {
    if (event instanceof PointerEvent && pointers.has(event.pointerId)) {
      pointers.set(event.pointerId, {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        buttons: event.buttons,
      });
    }
  };

  const onPointerUp = (event: Event) => {
    if (event instanceof PointerEvent) {
      pointers.delete(event.pointerId);
    }
  };

  const onPointerCancel = (event: Event) => {
    if (event instanceof PointerEvent) {
      pointers.delete(event.pointerId);
    }
  };

  const onBlur = () => {
    clearState();
  };

  const listeners: Array<[string, EventListener]> = [
    ["keydown", onKeyDown],
    ["keyup", onKeyUp],
    ["pointerdown", onPointerDown],
    ["pointermove", onPointerMove],
    ["pointerup", onPointerUp],
    ["pointercancel", onPointerCancel],
    ["blur", onBlur],
  ];

  const attachListeners = (eventTarget: EventTarget) => {
    for (const [type, listener] of listeners) {
      eventTarget.addEventListener(type, listener);
    }
  };

  const detachListeners = (eventTarget: EventTarget) => {
    for (const [type, listener] of listeners) {
      eventTarget.removeEventListener(type, listener);
    }
  };

  return {
    attach(eventTarget: EventTarget) {
      if (disposed) {
        return;
      }

      if (target === eventTarget) {
        return;
      }

      if (target !== null) {
        detachListeners(target);
        clearState();
      }

      target = eventTarget;
      attachListeners(eventTarget);
    },

    detach() {
      if (target !== null) {
        detachListeners(target);
        target = null;
      }

      clearState();
    },

    snapshot(): InputSnapshot {
      if (disposed || target === null) {
        return { keys: EMPTY_KEYS, pointers: EMPTY_POINTERS };
      }

      return {
        keys: new Set(keys),
        pointers: Array.from(pointers.values()),
      };
    },

    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;

      if (target !== null) {
        detachListeners(target);
        target = null;
      }

      clearState();
    },
  };
}
