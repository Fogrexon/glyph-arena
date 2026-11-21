import assert from "node:assert/strict";
import { test } from "node:test";

import { logicalScale, logicalViewWidth } from "../src/view.ts";

/**
 * HPD5: the runner needs no change for a Retina display, and that is a *property*, not an accident.
 *
 * `fitToWindow` now gives the canvas a bitmap of `innerWidth × devicePixelRatio`. The runner derives
 * its scale from `canvas.height`, so the scale is device pixels per logical unit — and the width it
 * frames is the same at every ratio. That is worth a test of its own because the failure is silent:
 * the picture looks right at ratio 1 and the world is a quarter of its size at ratio 2, with no
 * error and no wrong number anywhere except on the screen.
 */

const LOGICAL_HEIGHT = 540;

/** The bitmap a window produces at a given ratio, the way `fitToWindow` makes it. */
const bitmapOf = (cssWidth: number, cssHeight: number, ratio: number) => ({
  width: Math.round(cssWidth * ratio),
  height: Math.round(cssHeight * ratio),
});

test("HPD5: viewWidth is 720 logical units at dpr 1 and dpr 2, with scale() left in bitmap space", () => {
  for (const ratio of [1, 2, 3]) {
    const bitmap = bitmapOf(800, 600, ratio);

    assert.equal(
      logicalViewWidth(bitmap.width, bitmap.height, LOGICAL_HEIGHT),
      800 / (600 / LOGICAL_HEIGHT),
      `dpr ${ratio}: the framed width must not depend on the display`,
    );
  }

  // The number itself, so a future `LOGICAL_HEIGHT` change is a deliberate one: 800 CSS px at the
  // runner's aspect ratio is 720 logical units of road.
  assert.equal(logicalViewWidth(800, 600, LOGICAL_HEIGHT), 720);
  assert.equal(logicalViewWidth(1600, 1200, LOGICAL_HEIGHT), 720);
});

test("HPD5 reverse: dividing the scale by the ratio shrinks the world to the top-left quarter", () => {
  // What the spec first said to do, and what it would have cost. Not a style preference: the framed
  // width doubles, so everything drawn is half the size it was and the bottom half is empty road.
  const bitmap = bitmapOf(800, 600, 2);
  const asWritten = logicalScale(bitmap.height, LOGICAL_HEIGHT);
  const divided = asWritten / 2;

  assert.equal(bitmap.width / asWritten, 720);
  assert.equal(bitmap.width / divided, 1440, "dividing by the ratio doubles the logical width");
  assert.notEqual(bitmap.width / divided, bitmap.width / asWritten);
});

test("HPD5: the scale is device pixels per logical unit, so it does double with the ratio", () => {
  // The scale itself is *expected* to read 2 at dpr 2 — that is what "bitmap space" means. The width
  // is what has to stay put, and it does because both numbers move together.
  assert.equal(logicalScale(600, LOGICAL_HEIGHT), 600 / 540);
  assert.equal(logicalScale(1200, LOGICAL_HEIGHT), 1200 / 540);
  assert.equal(logicalScale(1200, LOGICAL_HEIGHT), 2 * logicalScale(600, LOGICAL_HEIGHT));
});
