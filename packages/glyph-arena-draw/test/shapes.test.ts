import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createDraw } from "../src/index.js";
import type { DrawContext, ViewMatrix } from "../src/index.js";

type Call = { method: string; args: unknown[] };

/**
 * A context that records what was asked of it. It answers `measureText` with a number that depends
 * on the font, so "the size reached the context" is observable rather than assumed.
 */
function createContext(options: { roundRect?: boolean } = {}): {
  calls: Call[];
  context: DrawContext;
  canvas: { width: number; height: number };
} {
  const calls: Call[] = [];
  let font = "";
  const canvas = { width: 800, height: 600 };

  const record = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
  };

  const context = {
    canvas,
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    get font() {
      return font;
    },
    set font(value: string) {
      font = value;
    },
    textAlign: "left",
    textBaseline: "alphabetic",
    save: record("save"),
    restore: record("restore"),
    beginPath: record("beginPath"),
    closePath: record("closePath"),
    rect: record("rect"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    arcTo: record("arcTo"),
    fill: record("fill"),
    stroke: record("stroke"),
    fillText: record("fillText"),
    clearRect: record("clearRect"),
    fillRect: record("fillRect"),
    drawImage: record("drawImage"),
    setTransform: record("setTransform"),
    measureText: (value: string) => {
      calls.push({ method: "measureText", args: [value] });
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 0);
      return { width: value.length * size };
    },
  } as unknown as DrawContext & { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void };

  if (options.roundRect !== false) {
    context.roundRect = record("roundRect");
  }

  return { calls, context, canvas };
}

const methods = (calls: Call[]): string[] => calls.map((call) => call.method);
const argsOf = (calls: Call[], method: string): unknown[][] =>
  calls.filter((call) => call.method === method).map((call) => call.args);

describe("rect", () => {
  it("fills, strokes, or both — and draws nothing at all when given neither", () => {
    const filled = createContext();
    createDraw({ context: filled.context }).rect({ x: 1, y: 2, w: 3, h: 4, fill: "#fff" });
    assert.deepEqual(methods(filled.calls).filter((m) => m === "fill" || m === "stroke"), ["fill"]);
    assert.deepEqual(argsOf(filled.calls, "fill").length, 1);

    const stroked = createContext();
    createDraw({ context: stroked.context }).rect({ x: 1, y: 2, w: 3, h: 4, stroke: "#000" });
    assert.deepEqual(methods(stroked.calls).filter((m) => m === "fill" || m === "stroke"), ["stroke"]);

    const both = createContext();
    createDraw({ context: both.context }).rect({ x: 0, y: 0, w: 1, h: 1, fill: "#fff", stroke: "#000" });
    assert.deepEqual(methods(both.calls).filter((m) => m === "fill" || m === "stroke"), ["fill", "stroke"]);

    // The shape of "no colour": not an exception, and not a stray path either.
    const none = createContext();
    createDraw({ context: none.context }).rect({ x: 0, y: 0, w: 10, h: 10 });
    assert.deepEqual(methods(none.calls), []);
  });

  it("rounds the corners through roundRect when the context has it", () => {
    const { calls, context } = createContext();
    createDraw({ context }).rect({ x: 0, y: 0, w: 40, h: 40, fill: "#fff", radius: 8 });

    assert.deepEqual(argsOf(calls, "roundRect"), [[0, 0, 40, 40, 8]]);
    assert.deepEqual(argsOf(calls, "rect"), []);
  });

  it("builds the corner path by hand when roundRect is missing", () => {
    const { calls, context } = createContext({ roundRect: false });
    createDraw({ context }).rect({ x: 0, y: 0, w: 40, h: 40, fill: "#fff", radius: 8 });

    // A path, not a plain rect: four arcs, and the radius clamped to half the box.
    assert.equal(argsOf(calls, "arcTo").length, 4);
    assert.deepEqual(argsOf(calls, "rect"), []);
    assert.deepEqual(argsOf(calls, "arcTo")[0], [40, 0, 40, 8, 8]);
  });

  it("uses a plain rect when the radius is zero or absent", () => {
    const { calls, context } = createContext();
    createDraw({ context }).rect({ x: 0, y: 0, w: 10, h: 10, fill: "#fff", radius: 0 });

    assert.deepEqual(argsOf(calls, "rect"), [[0, 0, 10, 10]]);
    assert.deepEqual(argsOf(calls, "roundRect"), []);
  });
});

describe("text", () => {
  it("puts y at the top by default, not on the baseline", () => {
    const { calls, context } = createContext();
    createDraw({ context }).text({ text: "SCORE", x: 10, y: 20, size: 16, fill: "#fff" });

    // Canvas' own default is `alphabetic`, which shifts every line down by its ascent.
    assert.equal(context.textBaseline, "top");
    assert.equal(context.textAlign, "left");
    assert.deepEqual(argsOf(calls, "fillText"), [["SCORE", 10, 20]]);
  });

  it("honours align, font and maxWidth", () => {
    const { calls, context } = createContext();
    createDraw({ context }).text({
      text: "0:25",
      x: 780,
      y: 8,
      size: 24,
      font: "monospace",
      align: "right",
      fill: "#fff",
      maxWidth: 100,
    });

    assert.equal(context.textAlign, "right");
    assert.equal(context.font, "24px monospace");
    assert.deepEqual(argsOf(calls, "fillText"), [["0:25", 780, 8, 100]]);
  });

  it("draws nothing without a fill", () => {
    const { calls, context } = createContext();
    createDraw({ context }).text({ text: "x", x: 0, y: 0, size: 10 });

    assert.deepEqual(methods(calls), []);
  });
});

describe("measureText", () => {
  it("reports the width the context would use, and moves with the size", () => {
    const { context } = createContext();
    const draw = createDraw({ context });

    const small = draw.measureText({ text: "HELLO", size: 10 });
    const large = draw.measureText({ text: "HELLO", size: 20 });

    assert.deepEqual(small, { width: 50, height: 10 });
    assert.deepEqual(large, { width: 100, height: 20 });
    assert.equal(context.font, "20px sans-serif", "the font is left as the caller last asked for it");
  });
});

describe("setView", () => {
  it("applies a camera matrix and returns to screen coordinates with null", () => {
    const { calls, context } = createContext();
    const draw = createDraw({ context });
    const view: ViewMatrix = { a: 1.5, b: 0, c: 0, d: 1.5, e: -120, f: -40 };

    draw.setView(view);
    draw.setView(null);

    assert.deepEqual(argsOf(calls, "setTransform"), [
      [1.5, 0, 0, 1.5, -120, -40],
      [1, 0, 0, 1, 0, 0],
    ]);
  });
});

/**
 * Where a `rect` call lands on the canvas, through the transform that was in force when it ran.
 *
 * The projection tests have to read this rather than only `setTransform`: six right numbers with
 * the rect drawn somewhere else would pass a test that stopped at the numbers, and the point of
 * the option is the pixels.
 */
function deviceRects(
  calls: Call[],
  transformIndex: number,
): { x: number; y: number; w: number; h: number }[] {
  const [a, b, c, d, e, f] = argsOf(calls, "setTransform")[transformIndex] as number[];

  return argsOf(calls, "rect").map(([x, y, w, h]) => ({
    x: a * x + c * y + e,
    y: b * x + d * y + f,
    w: a * w,
    h: d * h,
  }));
}

describe("setView with a projection", () => {
  it("D9: doubles and shifts — a rect at (60, 30) lands at (20, 40) and is 20×20", () => {
    const { calls, context } = createContext();
    const draw = createDraw({ context });

    draw.setView({ scale: 2, offsetX: -100, offsetY: -20 });
    draw.rect({ x: 60, y: 30, w: 10, h: 10, fill: "#fff" });

    // `[scale, 0, 0, scale, offsetX, offsetY]`, the one matrix a projection means.
    assert.deepEqual(argsOf(calls, "setTransform"), [[2, 0, 0, 2, -100, -20]]);
    assert.deepEqual(deviceRects(calls, 0), [{ x: 20, y: 40, w: 20, h: 20 }]);
  });

  it("D10: round rounds the offset, and never a point — two rects 0.2 apart stay 0.2 apart", () => {
    // Both offsets land on a fraction, so "rounded or not" is visible in the transform itself.
    const plain = createContext();
    const plainDraw = createDraw({ context: plain.context });
    plainDraw.setView({ scale: 1, offsetX: -100.4, offsetY: -20.6 });
    plainDraw.rect({ x: 0.4, y: 0, w: 1, h: 1, fill: "#fff" });
    plainDraw.rect({ x: 0.6, y: 0, w: 1, h: 1, fill: "#fff" });

    const rounded = createContext();
    const roundedDraw = createDraw({ context: rounded.context });
    roundedDraw.setView({ scale: 1, offsetX: -100.4, offsetY: -20.6, round: true });
    roundedDraw.rect({ x: 0.4, y: 0, w: 1, h: 1, fill: "#fff" });
    roundedDraw.rect({ x: 0.6, y: 0, w: 1, h: 1, fill: "#fff" });

    assert.deepEqual(argsOf(plain.calls, "setTransform"), [[1, 0, 0, 1, -100.4, -20.6]]);
    assert.deepEqual(argsOf(rounded.calls, "setTransform"), [[1, 0, 0, 1, -100, -21]]);

    // The rects themselves are passed through untouched: what a half-open wall would look like
    // if the points were rounded instead is `-100` and `-100` — one edge, no gap, a seam.
    const plainRects = deviceRects(plain.calls, 0);
    const roundedRects = deviceRects(rounded.calls, 0);
    const gap = (rects: { x: number; y: number; w: number; h: number }[]): number =>
      rects[1]!.x - rects[0]!.x;

    assert.ok(Math.abs(gap(plainRects) - 0.2) < 1e-9, `the plain gap is ${gap(plainRects)}`);
    assert.ok(
      Math.abs(gap(roundedRects) - 0.2) < 1e-9,
      `the rounded gap is ${gap(roundedRects)} — rounding the points would make it 0 or 1`,
    );
    assert.deepEqual(
      argsOf(rounded.calls, "rect"),
      [
        [0.4, 0, 1, 1],
        [0.6, 0, 1, 1],
      ],
      "the points are not rounded on the way in",
    );
  });

  it("D11: a projection after a matrix wins, and null still means screen coordinates", () => {
    const { calls, context } = createContext();
    const draw = createDraw({ context });

    draw.setView({ a: 1.5, b: 0, c: 0, d: 1.5, e: -120, f: -40 });
    draw.setView({ scale: 3, offsetX: 7, offsetY: 9 });
    draw.setView(null);

    assert.deepEqual(argsOf(calls, "setTransform"), [
      [1.5, 0, 0, 1.5, -120, -40],
      [3, 0, 0, 3, 7, 9],
      [1, 0, 0, 1, 0, 0],
    ]);
  });
});
