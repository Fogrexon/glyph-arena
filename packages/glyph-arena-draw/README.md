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
- `rect` without a radius is `fillRect` / `strokeRect`, not a path. On a fractional coordinate the
  two rasterise differently (measured: 2 pixels on a fill, 12 on a stroke), so the native call is
  what keeps a game's edges exactly where its hand-written `ctx.fillRect` put them.

## Scrolling without a camera

A game that scrolls a flat world owns a camera x and nothing else. Pass the numbers instead of a
matrix — `camera.view()` is still accepted, and `null` returns to screen coordinates.

```ts
draw.setView({ scale: 1, offsetX: -cameraX + shake, offsetY: 0, round: true });
draw.rect({ x: tileX, y: tileY, w: 32, h: 32, fill: "#4a5468" }); // world coordinates
draw.setView(null);
draw.text({ text: "SCORE 0", x: 12, y: 12, size: 16, fill: "#fff" }); // screen coordinates
```

- `Projection` is `{ scale, offsetX, offsetY, round? }`, applied as the matrix `[scale, 0, 0, scale, offsetX, offsetY]`.
- `round` rounds the **offset**, once — never a point on its way through. Two tiles at 0.4 and 0.6 stay 0.2 apart; rounding each one instead lands both on the same edge, and a wall made of tiles then shows a seam at every join.
- Halves go **away from zero**: `0.5` → `1`, `-0.5` → `-1`. That is what makes `offsetX: -cameraX` agree with the `-Math.round(cameraX)` it replaces on every frame, including the ones where the camera lands on a half pixel (`Math.round` sends `-10.5` to `-10`, a pixel short of the game's `-11`).
- The last `setView` wins, so the HUD after `setView(null)` needs no `save`/`restore`.

A canvas scaled by `scale: 2` draws a `w: 10` rect 20 pixels wide, and crisp text wants the HUD in screen coordinates rather than through the projection.
