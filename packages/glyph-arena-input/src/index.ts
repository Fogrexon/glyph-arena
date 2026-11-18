export type PointerState = {
  id: number;
  x: number;
  y: number;
  buttons: number;
};

export type InputSnapshot = {
  /**
   * Keys that are down now, **plus** every key that went down since the previous `snapshot()`.
   *
   * The second half is the latch: a loop samples once per frame, so a keydown and keyup that both
   * land between two samples were never down at all — which is why every mechanical test had to
   * hold a press for 150 ms before releasing. A press that is gone by the time the frame runs still
   * answers here for that one frame, so `actions.pressed()` sees the edge it was asked for.
   *
   * It is **one frame, not a hold**: a keyboard is discrete events, and nothing needs a key to
   * stay down after the player let go. `snapshot()` consumes the latch — call it once per frame,
   * as the loop does.
   */
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
  /** Keys that went down since the last snapshot: the press survives to the next frame, once. */
  const latch = new Set<string>();
  const pointers = new Map<number, PointerState>();

  const clearState = () => {
    keys.clear();
    latch.clear();
    pointers.clear();
  };

  const onKeyDown = (event: Event) => {
    if (event instanceof KeyboardEvent) {
      // Auto-repeat fires keydown again while the key is held; only the first is a press.
      if (!keys.has(event.code)) {
        latch.add(event.code);
      }
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

      // Down now, plus the presses the frame boundary would otherwise swallow. The latch is spent
      // here: one frame is the whole life of a press that ended before the loop looked.
      const frame = new Set(keys);
      for (const code of latch) {
        frame.add(code);
      }
      latch.clear();

      return {
        keys: frame,
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
