import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fitToWindow, measureCanvas, screenScale, toCanvasPoint } from "../src/index.js";
import type { ScreenBox } from "../src/index.js";

/** A 960x540 bitmap laid out in a 480x270 CSS box at (10, 20). Exactly half size. */
const BOX: ScreenBox = { left: 10, top: 20, width: 480, height: 270 };
const SIZE = { width: 960, height: 540 };

describe("screenScale", () => {
  it("is bitmap pixels per CSS pixel, per axis", () => {
    assert.deepEqual(screenScale(BOX, SIZE), { x: 2, y: 2 });
  });

  it("scales the axes independently, because a canvas can be stretched", () => {
    // The CSS box is squarer than the bitmap: using one scale for both would move the pointer to
    // the right pixel of the wrong row.
    const stretched: ScreenBox = { left: 0, top: 0, width: 400, height: 400 };

    assert.deepEqual(screenScale(stretched, SIZE), { x: 2.4, y: 1.35 });
  });

  it("answers 1 rather than Infinity for a box with no size", () => {
    // `display: none`, and the frame before the page is laid out, both give a zero box. Infinity
    // here turns every later coordinate into NaN, and a game never recovers from that.
    const hidden: ScreenBox = { left: 0, top: 0, width: 0, height: 0 };

    assert.deepEqual(screenScale(hidden, SIZE), { x: 1, y: 1 });
    // One axis with a size keeps its real scale; only the empty axis falls back to 1.
    assert.deepEqual(screenScale({ ...hidden, width: 480 }, SIZE), { x: 2, y: 1 });
  });
});

describe("toCanvasPoint", () => {
  it("subtracts the box origin and scales to the bitmap", () => {
    // The CSS position (10, 20) is the box's own top-left, so it is the bitmap's (0, 0).
    assert.deepEqual(toCanvasPoint({ x: 10, y: 20 }, BOX, SIZE), { x: 0, y: 0 });
    assert.deepEqual(toCanvasPoint({ x: 250, y: 155 }, BOX, SIZE), { x: 480, y: 270 });
  });

  it("puts a position outside the box outside the bitmap, sign and all", () => {
    // A thumb that slid off the left edge is at a negative bitmap x, not at 0: clamping here would
    // hide the drag that left the canvas.
    assert.deepEqual(toCanvasPoint({ x: 0, y: 0 }, BOX, SIZE), { x: -20, y: -40 });
  });

  it("keeps the point inside a non-integer scale, without rounding", () => {
    const odd: ScreenBox = { left: 0, top: 0, width: 300, height: 300 };

    // 2/3 of the way across the box is 2/3 of the way across the bitmap: 640.
    assert.deepEqual(toCanvasPoint({ x: 200, y: 300 }, odd, { width: 960, height: 960 }), {
      x: 640,
      y: 960,
    });
  });
});

describe("measureCanvas", () => {
  it("reads the box and the size once and hands back the scale", () => {
    let reads = 0;
    const canvas = {
      width: 960,
      height: 540,
      getBoundingClientRect: (): ScreenBox => {
        reads += 1;
        return BOX;
      },
    };

    const measured = measureCanvas(canvas);

    assert.equal(reads, 1, "one layout read per measurement");
    assert.deepEqual(measured, { box: BOX, size: SIZE, scale: { x: 2, y: 2 } });
  });
});

describe("fitToWindow", () => {
  /** A window that can be resized and that remembers its listeners. */
  function createWindow(width: number, height: number) {
    const listeners = new Set<() => void>();
    let innerWidth = width;
    let innerHeight = height;

    const host = {
      get innerWidth() {
        return innerWidth;
      },
      get innerHeight() {
        return innerHeight;
      },
      addEventListener(_type: "resize", listener: () => void) {
        listeners.add(listener);
      },
      removeEventListener(_type: "resize", listener: () => void) {
        listeners.delete(listener);
      },
    };

    const resizeTo = (nextWidth: number, nextHeight: number) => {
      innerWidth = nextWidth;
      innerHeight = nextHeight;
      for (const listener of listeners) {
        listener();
      }
    };

    return { host, resizeTo, listening: () => listeners.size };
  }

  it("sizes the canvas to the window at construction", () => {
    const { host } = createWindow(800, 600);
    const canvas = { width: 1, height: 1 };

    fitToWindow(canvas, host);

    assert.deepEqual(canvas, { width: 800, height: 600 });
  });

  it("follows a window resize, and runs onResize after the new size is in place", () => {
    const { host, resizeTo } = createWindow(800, 600);
    const canvas = { width: 1, height: 1 };
    const seen: Array<[number, number]> = [];

    fitToWindow(canvas, host, {
      // A zone built from `canvas.width` has to see the new number, not the old one.
      onResize: () => seen.push([canvas.width, canvas.height]),
    });

    resizeTo(320, 480);

    assert.deepEqual(canvas, { width: 320, height: 480 });
    assert.deepEqual(seen, [
      [800, 600],
      [320, 480],
    ]);
  });

  it("stops listening on stop, and stop is safe to call twice", () => {
    const { host, resizeTo, listening } = createWindow(800, 600);
    const canvas = { width: 1, height: 1 };
    const fit = fitToWindow(canvas, host);

    assert.equal(listening(), 1);

    fit.stop();
    fit.stop();
    assert.equal(listening(), 0);

    resizeTo(1024, 768);
    assert.deepEqual(canvas, { width: 800, height: 600 }, "a stopped fit does not follow");
  });
});
