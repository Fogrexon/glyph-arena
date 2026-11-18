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
  /**
   * Pointers that are down now, **plus** every press that landed since the previous `snapshot()`.
   *
   * The same latch the keys get, and for the same reason: a click or a tap that lands and lifts
   * between two frames was never down at all, so the frame that would have acted on it never saw
   * it — the title screen does not start and a menu item does not fire. A press that is already
   * gone still answers here for one frame, carrying the position it landed at.
   *
   * A pointer that is still down wins: its entry is the live position, not the position it landed
   * at. `snapshot()` consumes the latch — call it once per frame, as the loop does.
   */
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
  /** Presses that landed since the last snapshot: the pointer's version of the key latch. */
  const pressLatch = new Map<number, PointerState>();

  const clearState = () => {
    keys.clear();
    latch.clear();
    pointers.clear();
    pressLatch.clear();
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
      const landed: PointerState = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        buttons: event.buttons,
      };
      pointers.set(event.pointerId, landed);
      // Where it landed, not where it was when the frame finally ran.
      pressLatch.set(event.pointerId, landed);
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

      // Down now first: a pointer that is still there answers with its live position, and the
      // latch only fills in the presses that ended before this frame. The latch is spent here.
      const pressed = Array.from(pointers.values());
      for (const [id, landed] of pressLatch) {
        if (!pointers.has(id)) pressed.push(landed);
      }
      pressLatch.clear();

      return {
        keys: frame,
        pointers: pressed,
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
