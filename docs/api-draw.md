# @fogrexon/glyph-arena-draw

Minimal 2D canvas drawing helpers. See also [package README](../packages/glyph-arena-draw/README.md).

## Exports

| Name | Kind |
|------|------|
| `createDraw` | function |
| `DrawContext`, `CreateDrawOptions`, `Crop`, `SpriteOptions`, `Draw` | types |

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
