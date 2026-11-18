/**
 * Screen space: the CSS box a canvas is laid out in, the bitmap it actually is, and the ratio
 * between them.
 *
 * Two things every game with a canvas ends up writing by hand, and both of them wrong the first
 * time:
 *
 * 1. **A pointer arrives in CSS pixels and the game draws in bitmap pixels.** The canvas is
 *    `innerWidth x innerHeight` of *bitmap* while the layout gives it whatever the page decides, so
 *    on a phone with a device pixel ratio those are different numbers and comparing one against the
 *    other puts the buttons somewhere the player cannot see. The conversion is three lines and the
 *    guard (`a zero-sized box scales by 1`) is the line everybody forgets, because it only runs
 *    while the page is hidden.
 * 2. **A canvas has to be told its size, and told again when the window changes.** Three samples
 *    wrote the same `resize()` and the same `addEventListener`, and forgetting the listener is
 *    invisible until someone resizes the window.
 *
 * ## What this package does not do
 *
 * It does not decide how big the game is. The bitmap is the host's number (a phone and a laptop
 * want different ones), and a game that draws a fixed 640x360 view scales *inside* the canvas —
 * that transform is a camera decision, not a screen one.
 *
 * ## Structural, not `HTMLCanvasElement`
 *
 * Everything takes the smallest shape it needs (`width`/`height` and a bounding box), so the maths
 * is testable with numbers and a game can pass a mock. Nothing here imports a DOM type.
 */

/** The bitmap size: what `canvas.width` / `canvas.height` say. */
export type ScreenSize = {
  readonly width: number;
  readonly height: number;
};

/** The layout box, in CSS pixels: what `getBoundingClientRect` returns. */
export type ScreenBox = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

/** A position in whatever space the caller is holding. */
export type ScreenPoint = {
  readonly x: number;
  readonly y: number;
};

/** Bitmap pixels per CSS pixel. `1` on an axis whose box has no size. */
export type ScreenScale = {
  readonly x: number;
  readonly y: number;
};

/**
 * Bitmap pixels per CSS pixel, per axis.
 *
 * A box of zero size reports a scale of 1 rather than `Infinity`: `display: none` and a page that
 * has not been laid out yet both give a zero box, and a pointer that arrives during that window
 * must not turn every coordinate into `NaN` (a `NaN` position is not "off screen", it is a game
 * that never recovers).
 */
export function screenScale(box: ScreenBox, size: ScreenSize): ScreenScale {
  return {
    x: box.width === 0 ? 1 : size.width / box.width,
    y: box.height === 0 ? 1 : size.height / box.height,
  };
}

/**
 * A pointer position in CSS pixels, as the same position in bitmap pixels.
 *
 * The two axes scale independently: a canvas whose CSS box has a different aspect ratio from its
 * bitmap is stretched, and using one scale for both would put the pointer on the right pixel of the
 * wrong row.
 */
export function toCanvasPoint(point: ScreenPoint, box: ScreenBox, size: ScreenSize): ScreenPoint {
  const scale = screenScale(box, size);

  return { x: (point.x - box.left) * scale.x, y: (point.y - box.top) * scale.y };
}

/** Everything a frame needs to convert pointers, measured in one go. */
export type MeasuredCanvas = {
  readonly box: ScreenBox;
  readonly size: ScreenSize;
  readonly scale: ScreenScale;
};

/** The part of a canvas this package reads. A real `<canvas>` satisfies it. */
export type CanvasLike = {
  readonly width: number;
  readonly height: number;
  getBoundingClientRect(): ScreenBox;
};

/**
 * The canvas's box and size as they are **now**, with the scale already worked out.
 *
 * Measure once per frame, not once per pointer: `getBoundingClientRect` forces layout, and a frame
 * with two thumbs on the screen would pay for it twice for the same answer.
 */
export function measureCanvas(canvas: CanvasLike): MeasuredCanvas {
  const box = canvas.getBoundingClientRect();
  const size: ScreenSize = { width: canvas.width, height: canvas.height };

  return { box, size, scale: screenScale(box, size) };
}

/** The part of a canvas this package writes. A real `<canvas>` satisfies it. */
export type CanvasSized = {
  width: number;
  height: number;
};

/** The part of `window` this package uses. A real `window` satisfies it. */
export type WindowLike = {
  readonly innerWidth: number;
  readonly innerHeight: number;
  addEventListener(type: "resize", listener: () => void): void;
  removeEventListener(type: "resize", listener: () => void): void;
};

export type FitOptions = {
  /**
   * Called after every size change, including the one at construction.
   *
   * A game that keeps geometry in canvas pixels (a touch pad, a HUD layout) has to rebuild it when
   * the canvas changes, and rebuilding it on the frame instead would throw away a press in flight.
   */
  readonly onResize?: () => void;
};

export type WindowFit = {
  /** Size the canvas to the window now. The constructor already did this once. */
  resize(): void;
  /** Stop listening. Safe to call twice. */
  stop(): void;
};

/**
 * Make the canvas fill the window, and keep it that way.
 *
 * The bitmap is set to `innerWidth x innerHeight` — the CSS box is the page's business, and with no
 * style the two end up the same, which is what every sample wanted. `onResize` runs after the new
 * size is in place, so a zone built from `canvas.width` sees the new number.
 */
export function fitToWindow(canvas: CanvasSized, host: WindowLike, options: FitOptions = {}): WindowFit {
  const resize = () => {
    canvas.width = host.innerWidth;
    canvas.height = host.innerHeight;
    options.onResize?.();
  };

  resize();
  host.addEventListener("resize", resize);

  let stopped = false;

  return {
    resize,
    stop() {
      if (stopped) {
        return;
      }

      stopped = true;
      host.removeEventListener("resize", resize);
    },
  };
}
