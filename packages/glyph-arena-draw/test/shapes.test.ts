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
