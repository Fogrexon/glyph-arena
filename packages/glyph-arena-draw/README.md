# @fogrexon/glyph-arena-draw

Minimal 2D canvas drawing helpers for Glyph Arena.

## API

```ts
import { createDraw } from "@fogrexon/glyph-arena-draw";

const draw = createDraw({ context });

draw.clear();
draw.clear("#000000");

draw.sprite({ image, x: 0, y: 0 });
draw.sprite({
  image,
  x: 10,
  y: 20,
  width: 32,
  height: 32,
  crop: { x: 0, y: 0, width: 16, height: 16 },
  alpha: 0.5,
});
```

### `createDraw({ context })`

Returns a draw helper bound to a borrowed `CanvasRenderingContext2D` or `OffscreenCanvasRenderingContext2D`. The context is not owned and there is no `dispose`.

- `clear(color?)` — Clears the full canvas (`canvas.width` × `canvas.height`). Without `color`, uses `clearRect`. With `color`, fills the canvas.
- `sprite({ image, x, y, width?, height?, crop?, alpha? })` — Draws a `CanvasImageSource` (including `ImageBitmap`) at `(x, y)`.
  - `crop` — `{ x, y, width, height }` source rectangle.
  - `width` / `height` — Destination size. Default to image size, or crop size when `crop` is set.
  - `alpha` — Optional opacity in `0..1` (clamped). Restores `context.globalAlpha` after drawing. Omitted means `1` (unchanged).

## Shapes and text, with no assets

A canvas with no images still needs something on it. These four calls are the minimum: a rectangle
(rounded by an option, not a second function), text, the width that text will take, and the camera.

```ts
const draw = createDraw({ context });

draw.rect({ x: 16, y: 16, w: 120, h: 24, fill: "#1b1b1f", stroke: "#4af", lineWidth: 2, radius: 6 });
draw.text({ text: "SCORE 0", x: 20, y: 20, size: 16, fill: "#fff" });

// HUD right-aligned: measure, don't guess.
const { width } = draw.measureText({ text: "0:25", size: 24, font: "monospace" });
draw.text({ text: "0:25", x: 784 - width, y: 8, size: 24, font: "monospace", fill: "#fff" });

// The camera, and the HUD that must not scroll with it.
draw.setView(camera.view(width, height));
draw.rect({ x: player.x, y: player.y, w: 20, h: 28, fill: "#fff" });
draw.setView(null);
```

- `text` puts `y` at the **top** of the text, not the baseline: Canvas' own default is `alphabetic`,
  which shifts every line down by its ascent on some screens and not others.
- `rect` with neither `fill` nor `stroke` draws **nothing** rather than throwing. This runs every
  frame; an exception there does not report a mistake, it stops the game.
- `setView(matrix | null)` takes `camera.view()` as it is, and `null` returns to screen coordinates.
