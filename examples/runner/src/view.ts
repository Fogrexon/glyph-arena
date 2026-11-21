/**
 * How much of the world the runner shows, in its own units.
 *
 * The game is laid out against a `LOGICAL_HEIGHT` of 540 and everything it draws — HUD text, touch
 * buttons, the camera's vertical framing — is sized in those units. Two numbers turn a canvas into
 * them, and they are here rather than in `main.ts` because getting them wrong is invisible in a
 * screenshot: the picture is right at one display and the world is half as wide at another.
 *
 * **The side matters.** `fitToWindow` gives the canvas a bitmap of `innerWidth × devicePixelRatio`,
 * so `canvas.width` is device pixels. A scale derived from it is device pixels per logical unit, and
 * `bitmapWidth / scale` then returns the same logical width at every ratio — which is the whole
 * point. Dividing the scale by the ratio as well would return that width multiplied by the ratio,
 * and the world would shrink into the top-left corner on a Retina display.
 */

/** Device pixels per logical unit, for a bitmap `bitmapHeight` tall. */
export function logicalScale(bitmapHeight: number, logicalHeight: number): number {
  return bitmapHeight / logicalHeight;
}

/**
 * The world width the camera frames, in logical units.
 *
 * Constant across displays: a 800×600 CSS window is 800×600 device pixels at ratio 1 and 1600×1200
 * at ratio 2, and both give 720.
 */
export function logicalViewWidth(bitmapWidth: number, bitmapHeight: number, logicalHeight: number): number {
  return bitmapWidth / logicalScale(bitmapHeight, logicalHeight);
}
