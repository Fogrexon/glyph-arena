import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
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

    assert.deepEqual(calls, [
      { method: "clearRect", args: [0, 0, 640, 480] },
    ]);
  });

  it("clear with color fills full canvas", () => {
    const { calls, context } = createMockContext(320, 240);
    const draw = createDraw({ context });

    draw.clear("#112233");

    assert.deepEqual(calls, [
      { method: "fillStyle", args: ["#112233"] },
      { method: "fillRect", args: [0, 0, 320, 240] },
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

  it("does not import sibling packages", () => {
    const source = readFileSync(
      join(packageRoot, "src", "index.ts"),
      "utf8",
    );

    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-loop/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-input/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-timer/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-assets/);
    assert.doesNotMatch(source, /\bscene\b/i);
    assert.doesNotMatch(source, /\bcamera\b/i);
    assert.doesNotMatch(source, /\bWebGL\b/i);
    assert.doesNotMatch(source, /\bbatch/i);
    assert.doesNotMatch(source, /\brotate/i);
    assert.doesNotMatch(source, /\bflip/i);
    assert.doesNotMatch(source, /\blayer/i);
  });
});
