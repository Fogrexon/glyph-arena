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
