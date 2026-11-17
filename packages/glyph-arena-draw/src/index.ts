export type DrawContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export type CreateDrawOptions = {
  context: DrawContext;
};

export type Crop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SpriteOptions = {
  image: CanvasImageSource;
  x: number;
  y: number;
  width?: number;
  height?: number;
  crop?: Crop;
  alpha?: number;
};

/** A 2D affine matrix, the shape `camera.view()` returns: pass it to `setView`. */
export type ViewMatrix = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

export type RectOptions = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Fill colour. `fill` and `stroke` are both optional; with neither, nothing is drawn. */
  fill?: string;
  /** Outline colour. */
  stroke?: string;
  lineWidth?: number;
  /** Corner radius. A rounded rectangle is a rectangle, so it is this option, not a function. */
  radius?: number;
};

export type TextOptions = {
  text: string;
  x: number;
  y: number;
  /** Font size in pixels. */
  size: number;
  /** Font family; `sans-serif` when omitted. */
  font?: string;
  fill?: string;
  /**
   * `left` by default. `right` makes `x` the right edge, `center` the middle.
   */
  align?: CanvasTextAlign;
  /**
   * `top` by default, so `y` is the top of the text. Canvas' own default is `alphabetic`, which
   * puts the baseline on `y` and makes the same code look shifted down on everyone's screen.
   */
  baseline?: CanvasTextBaseline;
  maxWidth?: number;
};

export type MeasureTextOptions = {
  text: string;
  size: number;
  font?: string;
};

export type TextMetricsSize = {
  width: number;
  height: number;
};

export type Draw = {
  clear: (color?: string) => void;
  sprite: (options: SpriteOptions) => void;
  /** A rectangle, optionally filled, outlined, and rounded. */
  rect: (options: RectOptions) => void;
  /** A line of text, with `y` as its top by default. */
  text: (options: TextOptions) => void;
  /** The width the text would take at that size, and the size as its height. */
  measureText: (options: MeasureTextOptions) => TextMetricsSize;
  /** Apply a camera matrix (`camera.view()`), or `null` to go back to screen coordinates. */
  setView: (matrix: ViewMatrix | null) => void;
};

function getCanvasSize(context: DrawContext): { width: number; height: number } {
  const { width, height } = context.canvas;
  return { width, height };
}

function getImageDimensions(image: CanvasImageSource): {
  width: number;
  height: number;
} {
  if (
    typeof HTMLVideoElement !== "undefined" &&
    image instanceof HTMLVideoElement
  ) {
    return { width: image.videoWidth, height: image.videoHeight };
  }

  if (
    typeof image === "object" &&
    image !== null &&
    "width" in image &&
    "height" in image &&
    typeof image.width === "number" &&
    typeof image.height === "number"
  ) {
    return { width: image.width, height: image.height };
  }

  throw new Error("Unsupported CanvasImageSource");
}

function clampAlpha(alpha: number): number {
  return Math.min(1, Math.max(0, alpha));
}

/**
 * The font family when the caller names none. Not a game's number and not a game's choice: a canvas
 * with no font set renders at 10px sans-serif, which looks like a mistake rather than a default.
 */
const DEFAULT_FONT = "sans-serif";

/** Canvas' own default. Written down because `lineWidth ?? DEFAULT_LINE_WIDTH` has to say something. */
const DEFAULT_LINE_WIDTH = 1;

/** The identity transform: what `setView(null)` restores. */
const IDENTITY: ViewMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function fontOf(size: number, font?: string): string {
  return `${size}px ${font ?? DEFAULT_FONT}`;
}

/**
 * A rounded rectangle built from arcs, for a context without `roundRect` (older Safari). The radius
 * is clamped so a radius wider than the box draws a stadium instead of turning itself inside out.
 */
function roundedRectPath(
  context: DrawContext,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.min(radius, w / 2, h / 2);
  const right = x + w;
  const bottom = y + h;

  context.moveTo(x + r, y);
  context.lineTo(right - r, y);
  context.arcTo(right, y, right, y + r, r);
  context.lineTo(right, bottom - r);
  context.arcTo(right, bottom, right - r, bottom, r);
  context.lineTo(x + r, bottom);
  context.arcTo(x, bottom, x, bottom - r, r);
  context.lineTo(x, y + r);
  context.arcTo(x, y, x + r, y, r);
  context.closePath();
}

export function createDraw({ context }: CreateDrawOptions): Draw {
  const clear = (color?: string): void => {
    const { width, height } = getCanvasSize(context);

    if (color === undefined) {
      context.clearRect(0, 0, width, height);
      return;
    }

    context.fillStyle = color;
    context.fillRect(0, 0, width, height);
  };

  const sprite = ({
    image,
    x,
    y,
    width,
    height,
    crop,
    alpha,
  }: SpriteOptions): void => {
    const sourceSize = crop ?? getImageDimensions(image);
    const destWidth = width ?? sourceSize.width;
    const destHeight = height ?? sourceSize.height;

    const previousAlpha = context.globalAlpha;
    if (alpha !== undefined) {
      context.globalAlpha = clampAlpha(alpha);
    }

    try {
      if (crop !== undefined) {
        context.drawImage(
          image,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          x,
          y,
          destWidth,
          destHeight,
        );
      } else if (width !== undefined || height !== undefined) {
        context.drawImage(image, x, y, destWidth, destHeight);
      } else {
        context.drawImage(image, x, y);
      }
    } finally {
      context.globalAlpha = previousAlpha;
    }
  };

  /**
   * Nothing is drawn when there is neither a fill nor a stroke — not an error. This runs every
   * frame, and a throw there does not report a mistake, it stops the game.
   */
  const rect = ({ x, y, w, h, fill, stroke, lineWidth, radius }: RectOptions): void => {
    if (fill === undefined && stroke === undefined) return;

    context.save();
    context.beginPath();
    if (radius !== undefined && radius > 0) {
      if (typeof context.roundRect === "function") {
        context.roundRect(x, y, w, h, radius);
      } else {
        roundedRectPath(context, x, y, w, h, radius);
      }
    } else {
      context.rect(x, y, w, h);
    }

    if (fill !== undefined) {
      context.fillStyle = fill;
      context.fill();
    }

    if (stroke !== undefined) {
      context.strokeStyle = stroke;
      context.lineWidth = lineWidth ?? DEFAULT_LINE_WIDTH;
      context.stroke();
    }

    context.restore();
  };

  const text = ({
    text: value,
    x,
    y,
    size,
    font,
    fill,
    align,
    baseline,
    maxWidth,
  }: TextOptions): void => {
    if (fill === undefined) return;

    context.save();
    context.font = fontOf(size, font);
    context.textAlign = align ?? "left";
    context.textBaseline = baseline ?? "top";
    context.fillStyle = fill;

    if (maxWidth === undefined) {
      context.fillText(value, x, y);
    } else {
      context.fillText(value, x, y, maxWidth);
    }

    context.restore();
  };

  const measureText = ({ text: value, size, font }: MeasureTextOptions): TextMetricsSize => {
    context.save();
    context.font = fontOf(size, font);
    const { width } = context.measureText(value);
    context.restore();

    return { width, height: size };
  };

  const setView = (matrix: ViewMatrix | null): void => {
    const view = matrix ?? IDENTITY;
    context.setTransform(view.a, view.b, view.c, view.d, view.e, view.f);
  };

  return {
    clear,
    sprite,
    rect,
    text,
    measureText,
    setView,
  };
}
