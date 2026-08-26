export type GamepadState = {
  index: number;
  id: string;
  buttons: readonly boolean[];
  axes: readonly number[];
};

export type GamepadReader = {
  snapshot: () => readonly GamepadState[];
  dispose: () => void;
};

export type CreateGamepadOptions = {
  getGamepads?: () => (globalThis.Gamepad | null)[];
};

const EMPTY_SNAPSHOT: readonly GamepadState[] = [];

export function createGamepad(options: CreateGamepadOptions = {}): GamepadReader {
  let disposed = false;
  const getGamepads =
    options.getGamepads ??
    (() => Array.from(navigator.getGamepads()));

  const snapshot = (): readonly GamepadState[] => {
    if (disposed) {
      return EMPTY_SNAPSHOT;
    }

    const pads = getGamepads();
    const result: GamepadState[] = [];

    for (const pad of pads) {
      if (pad === null || !pad.connected) {
        continue;
      }

      result.push({
        index: pad.index,
        id: pad.id,
        buttons: pad.buttons.map((button) => button.pressed),
        axes: [...pad.axes],
      });
    }

    return result;
  };

  const dispose = (): void => {
    if (disposed) {
      return;
    }

    disposed = true;
  };

  return {
    snapshot,
    dispose,
  };
}
