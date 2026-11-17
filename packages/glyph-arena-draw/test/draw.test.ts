import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { exportedNames } from "../../../scripts/lib/public-surface.mjs";
import { createDraw } from "../src/index.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

type RecordedCall = {
  method: string;
  args: unknown[];
};

type MockImage = {
  width: number;
  height: number;
};

function createMockContext(
  canvasWidth = 800,
  canvasHeight = 600,
): {
  calls: RecordedCall[];
  context: CanvasRenderingContext2D;
} {
  const calls: RecordedCall[] = [];
  let globalAlpha = 1;
  let alphaAtLastDraw = -1;
  let fillStyle = "";

  const context = {
    canvas: {
      width: canvasWidth,
      height: canvasHeight,
    },
    get globalAlpha() {
      return globalAlpha;
    },
    set globalAlpha(value: number) {
      globalAlpha = value;
    },
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: string) {
      fillStyle = value;
      calls.push({ method: "fillStyle", args: [value] });
    },
    clearRect: (...args: unknown[]) => {
      calls.push({ method: "clearRect", args });
    },
    fillRect: (...args: unknown[]) => {
      calls.push({ method: "fillRect", args });
    },
    drawImage: (...args: unknown[]) => {
      alphaAtLastDraw = globalAlpha;
      calls.push({ method: "drawImage", args });
    },
    save: () => {
      calls.push({ method: "save", args: [] });
    },
    restore: () => {
      calls.push({ method: "restore", args: [] });
    },
    setTransform: (...args: unknown[]) => {
      calls.push({ method: "setTransform", args });
    },
  };

  return {
    calls,
    getAlphaAtLastDraw: () => alphaAtLastDraw,
    context: context as unknown as CanvasRenderingContext2D,
  };
}

describe("createDraw", () => {
  it("clear without color uses clearRect for full canvas", () => {
    const { calls, context } = createMockContext(640, 480);
    const draw = createDraw({ context });

    draw.clear();

    // The identity transform goes on first: `clearRect` is affected by the current transform, and
    // `clear` promises "the full canvas".
    assert.deepEqual(calls, [
      { method: "save", args: [] },
      { method: "setTransform", args: [1, 0, 0, 1, 0, 0] },
      { method: "clearRect", args: [0, 0, 640, 480] },
      { method: "restore", args: [] },
    ]);
  });

  it("clear with color fills full canvas", () => {
    const { calls, context } = createMockContext(320, 240);
    const draw = createDraw({ context });

    draw.clear("#112233");

    assert.deepEqual(calls, [
      { method: "save", args: [] },
      { method: "setTransform", args: [1, 0, 0, 1, 0, 0] },
      { method: "fillStyle", args: ["#112233"] },
      { method: "fillRect", args: [0, 0, 320, 240] },
      { method: "restore", args: [] },
    ]);
  });

  it("sprite without crop or size uses 3-argument drawImage", () => {
    const { calls, context } = createMockContext();
    const draw = createDraw({ context });
    const image: MockImage = { width: 64, height: 32 };

    draw.sprite({ image, x: 10, y: 20 });

    assert.deepEqual(calls, [
      {
        method: "drawImage",
        args: [image, 10, 20],
      },
    ]);
  });

  it("sprite with explicit size uses 5-argument drawImage", () => {
    const { calls, context } = createMockContext();
    const draw = createDraw({ context });
    const image: MockImage = { width: 64, height: 32 };

    draw.sprite({ image, x: 5, y: 6, width: 100, height: 50 });

    assert.deepEqual(calls, [
      {
        method: "drawImage",
        args: [image, 5, 6, 100, 50],
      },
    ]);
  });

  it("sprite with crop uses 9-argument drawImage and crop default size", () => {
    const { calls, context } = createMockContext();
    const draw = createDraw({ context });
    const image: MockImage = { width: 128, height: 96 };

    draw.sprite({
      image,
      x: 1,
      y: 2,
      crop: { x: 8, y: 16, width: 24, height: 12 },
    });

    assert.deepEqual(calls, [
      {
        method: "drawImage",
        args: [image, 8, 16, 24, 12, 1, 2, 24, 12],
      },
    ]);
  });

  it("sprite with crop and explicit size uses crop source and custom destination size", () => {
    const { calls, context } = createMockContext();
    const draw = createDraw({ context });
    const image: MockImage = { width: 128, height: 96 };

    draw.sprite({
      image,
      x: 3,
      y: 4,
      width: 48,
      height: 24,
      crop: { x: 0, y: 0, width: 16, height: 8 },
    });

    assert.deepEqual(calls, [
      {
        method: "drawImage",
        args: [image, 0, 0, 16, 8, 3, 4, 48, 24],
      },
    ]);
  });

  it("sprite clamps alpha and restores globalAlpha", () => {
    const { calls, context, getAlphaAtLastDraw } = createMockContext();
    context.globalAlpha = 0.25;
    const draw = createDraw({ context });
    const image: MockImage = { width: 10, height: 10 };

    draw.sprite({ image, x: 0, y: 0, alpha: 1.5 });

    assert.equal(getAlphaAtLastDraw(), 1);
    assert.equal(context.globalAlpha, 0.25);
    assert.deepEqual(calls, [
      {
        method: "drawImage",
        args: [image, 0, 0],
      },
    ]);
  });

  it("sprite clamps negative alpha and restores globalAlpha", () => {
    const { context, getAlphaAtLastDraw } = createMockContext();
    context.globalAlpha = 0.8;
    const draw = createDraw({ context });
    const image: MockImage = { width: 10, height: 10 };

    draw.sprite({ image, x: 0, y: 0, alpha: -0.2 });

    assert.equal(getAlphaAtLastDraw(), 0);
    assert.equal(context.globalAlpha, 0.8);
  });

  it("sprite without alpha does not change globalAlpha", () => {
    const { calls, context } = createMockContext();
    context.globalAlpha = 0.5;
    const draw = createDraw({ context });
    const image: MockImage = { width: 10, height: 10 };

    draw.sprite({ image, x: 0, y: 0 });

    assert.equal(context.globalAlpha, 0.5);
    assert.deepEqual(calls, [
      {
        method: "drawImage",
        args: [image, 0, 0],
      },
    ]);
  });

  it("exports only the names on its public list, and imports no sibling package", () => {
    const source = readFileSync(join(packageRoot, "src", "index.ts"), "utf8");

    // The surface, not the vocabulary: a new public name has to be added here on purpose,
    // and a word used inside a function is not a name. This is what used to be a list of
    // forbidden words, which turned `follow` into a reason a package could not grow.
    assert.deepEqual(exportedNames(source), [
      "CreateDrawOptions",
      "Crop",
      "Draw",
      "DrawContext",
      "MeasureTextOptions",
      "RectOptions",
      "SpriteOptions",
      "TextMetricsSize",
      "TextOptions",
      "ViewMatrix",
      "createDraw",
    ]);

    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-loop/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-input/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-timer/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-assets/);
  });
});

describe("clear under a camera", () => {
  it("resets the transform before clearing, so a camera does not leave the edges behind", () => {
    const { calls, context } = createMockContext(320, 240);
    const draw = createDraw({ context });

    // The order the game loop uses: draw through the camera, then clear at the top of the frame.
    draw.setView({ a: 1, b: 0, c: 0, d: 1, e: 50, f: 40 });
    calls.length = 0;
    draw.clear();

    const clears = calls.findIndex((call) => call.method === "clearRect");
    const reset = calls.findIndex(
      (call) => call.method === "setTransform" && (call.args as number[]).join() === "1,0,0,1,0,0",
    );

    assert.notEqual(clears, -1, "clear must still clear");
    assert.notEqual(reset, -1, "the transform must be reset before clearing");
    assert.ok(reset < clears, "the reset has to come before the clearRect, not after");
    // And the caller's camera is still what it was: this is a borrow, not a change.
    assert.equal(calls.filter((call) => call.method === "restore").length, 1);
  });
});
