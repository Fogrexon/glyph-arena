# @fogrexon/glyph-arena-draw

Minimal 2D canvas drawing helpers. See also [package README](../packages/glyph-arena-draw/README.md).

## Exports

| Name | Kind |
|------|------|
| `createDraw` | function |
| `DrawContext`, `CreateDrawOptions`, `Crop`, `SpriteOptions`, `Draw` | types |
| `ViewMatrix`, `Projection`, `RectOptions`, `TextOptions`, `MeasureTextOptions`, `TextMetricsSize` | types |

This package does not import sibling `@fogrexon/glyph-arena-*` packages.

## `createDraw({ context })`

```ts
const draw = createDraw({ context }); // CanvasRenderingContext2D or OffscreenCanvasRenderingContext2D

draw.clear();           // or draw.clear("#112233")
draw.sprite({ image, x, y, width?, height?, crop?, alpha? });
```

### Methods

- **`clear(color?)`** — without `color`, clears the full canvas with `clearRect`. With `color`, fills the full canvas.
- **`sprite(options)`** — draw a `CanvasImageSource` at `(x, y)`.

### `SpriteOptions`

| Field | Type | Description |
|-------|------|-------------|
| `image` | `CanvasImageSource` | source image |
| `x` | `number` | destination x |
| `y` | `number` | destination y |
| `width?` | `number` | destination width |
| `height?` | `number` | destination height |
| `crop?` | `Crop` | source rectangle |
| `alpha?` | `number` | opacity, clamped to `0..1` |

### `Crop`

| Field | Type | Description |
|-------|------|-------------|
| `x` | `number` | source x |
| `y` | `number` | source y |
| `width` | `number` | source width |
| `height` | `number` | source height |

### Drawing behavior

- Without `crop` or size, uses native-size `drawImage(image, x, y)`.
- With `width` and/or `height` only, scales to the given destination size.
- With `crop`, uses the crop as the source rect. Default destination size matches the crop size unless `width`/`height` are set.
- When `alpha` is set, `globalAlpha` is temporarily changed and restored after drawing.
- Unsupported `CanvasImageSource` types throw `"Unsupported CanvasImageSource"`.

## Views

`setView` takes a camera matrix, a `Projection`, or `null`. The last call wins, so a HUD drawn after `setView(null)` needs no `save`/`restore`.

```ts
draw.setView(camera.view(width, height));       // a Camera, when the game has one
draw.rect({ x: player.x, y: player.y, w: 20, h: 28, fill: "#fff" });

draw.setView({ scale: 1, offsetX: -cameraX, offsetY: 0, round: true }); // a flat scrolling world
draw.rect({ x: tileX, y: tileY, w: 32, h: 32, fill: "#4a5468" });

draw.setView(null);                             // screen coordinates again
draw.text({ text: "SCORE 0", x: 12, y: 12, size: 16, fill: "#fff" });
```

### `Projection`

| Field | Type | Description |
|-------|------|-------------|
| `scale` | `number` | `1` draws at native size, `2` doubles it |
| `offsetX` | `number` | screen pixels; `-100` puts world x = 0 at screen x = -100 |
| `offsetY` | `number` | screen pixels |
| `round?` | `boolean` | rounds the **offset** to whole pixels, once |

A projection is the matrix `[scale, 0, 0, scale, offsetX, offsetY]`.

`round` rounds the offset, never a point. Two tiles at 0.4 and 0.6 stay 0.2 apart; rounding each point instead puts them on the same edge, and a wall built from tiles then shows a seam at every join. A game that scrolls rounds its camera once and subtracts it — which is what this option is.

## Rectangles and text

- `rect` without a radius is `fillRect` / `strokeRect`; with a radius it is a path.
- A rectangle with neither `fill` nor `stroke` draws nothing rather than throwing.
- `text` puts `y` at the top of the text, not the baseline.

The native calls are not an optimisation detail: on a fractional coordinate a path fill differs from `fillRect` by 2 pixels and a path stroke from `strokeRect` by 12 (measured in Chromium). A game moving from hand-written `ctx.fillRect` to `draw.rect` keeps its edges exactly.
