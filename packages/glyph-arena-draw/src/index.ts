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

export type Draw = {
  clear: (color?: string) => void;
  sprite: (options: SpriteOptions) => void;
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

  return {
    clear,
    sprite,
  };
}
