import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createGamepad } from "../src/index.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

type MockGamepad = {
  index: number;
  id: string;
  connected: boolean;
  buttons: Array<{ pressed: boolean }>;
  axes: number[];
};

function mockGamepad(
  init: Partial<MockGamepad> & Pick<MockGamepad, "index" | "id">,
): MockGamepad {
  return {
    connected: true,
    buttons: [],
    axes: [],
    ...init,
  };
}

describe("createGamepad", () => {
  it("omits disconnected pads", () => {
    const gamepad = createGamepad({
      getGamepads: () => [
        mockGamepad({ index: 0, id: "connected", connected: true }),
        mockGamepad({ index: 1, id: "disconnected", connected: false }),
      ] as unknown as (globalThis.Gamepad | null)[],
    });

    const snapshot = gamepad.snapshot();
    assert.equal(snapshot.length, 1);
    assert.equal(snapshot[0]?.index, 0);
    assert.equal(snapshot[0]?.id, "connected");
  });

  it("skips null slots from getGamepads", () => {
    const gamepad = createGamepad({
      getGamepads: () => [
        null,
        mockGamepad({ index: 1, id: "pad-1" }),
        null,
      ] as unknown as (globalThis.Gamepad | null)[],
    });

    const snapshot = gamepad.snapshot();
    assert.equal(snapshot.length, 1);
    assert.equal(snapshot[0]?.index, 1);
    assert.equal(snapshot[0]?.id, "pad-1");
  });

  it("copies buttons and axes so caller mutation does not affect next snapshot", () => {
    const pad = mockGamepad({
      index: 0,
      id: "pad-0",
      buttons: [{ pressed: true }, { pressed: false }],
      axes: [0.5, -0.25],
    });

    const gamepad = createGamepad({
      getGamepads: () => [pad as unknown as globalThis.Gamepad],
    });

    const first = gamepad.snapshot();
    assert.deepEqual(first[0]?.buttons, [true, false]);
    assert.deepEqual(first[0]?.axes, [0.5, -0.25]);

    first[0]!.buttons[0] = false;
    first[0]!.axes[0] = 1;

    const second = gamepad.snapshot();
    assert.deepEqual(second[0]?.buttons, [true, false]);
    assert.deepEqual(second[0]?.axes, [0.5, -0.25]);
  });

  it("returns empty snapshot after dispose", () => {
    const gamepad = createGamepad({
      getGamepads: () => [
        mockGamepad({ index: 0, id: "pad-0" }),
      ] as unknown as (globalThis.Gamepad | null)[],
    });

    assert.equal(gamepad.snapshot().length, 1);

    gamepad.dispose();

    assert.deepEqual(gamepad.snapshot(), []);
    assert.doesNotThrow(() => {
      gamepad.dispose();
    });
  });

  it("reads pressed state and raw axes without deadzone", () => {
    const gamepad = createGamepad({
      getGamepads: () => [
        mockGamepad({
          index: 2,
          id: "raw-pad",
          buttons: [{ pressed: true }],
          axes: [0.01, -0.99],
        }),
      ] as unknown as (globalThis.Gamepad | null)[],
    });

    const snapshot = gamepad.snapshot();
    assert.deepEqual(snapshot[0]?.buttons, [true]);
    assert.deepEqual(snapshot[0]?.axes, [0.01, -0.99]);
  });

  it("returns empty snapshot when navigator is unavailable", () => {
    const gamepad = createGamepad();

    assert.deepEqual(gamepad.snapshot(), []);
  });

  it("returns empty snapshot when navigator.getGamepads is missing", () => {
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: {},
      configurable: true,
    });

    try {
      const gamepad = createGamepad();
      assert.deepEqual(gamepad.snapshot(), []);
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        configurable: true,
      });
    }
  });

  it("propagates errors when getGamepads throws", () => {
    const error = new Error("boom");
    const gamepad = createGamepad({
      getGamepads: () => {
        throw error;
      },
    });

    assert.throws(() => gamepad.snapshot(), error);
  });

  it("does not import sibling glyph-arena packages", () => {
    const source = readFileSync(join(packageRoot, "src", "index.ts"), "utf8");

    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-loop/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-input/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-timer/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-assets/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-actions/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-audio/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-draw/);
  });
});
