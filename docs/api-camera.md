# @fogrexon/glyph-arena-camera

2D camera state and world-to-screen view matrix. See also [package README](../packages/glyph-arena-camera/README.md).

## Exports

| Name | Kind |
|------|------|
| `createCamera` | function |
| `CameraState`, `Matrix2D`, `Camera` | types |

This package does not import `@fogrexon/glyph-arena-transform` or other sibling packages.

## `createCamera()`

```ts
const camera = createCamera();

camera.set({ x: 100, y: 50, rotation: Math.PI / 4, zoom: 2 });
const state = camera.get();
const matrix = camera.view(800, 600);
camera.dispose();
```

### Methods

- **`set(partial)`** — merge `partial` into camera state. Only keys present on `partial` with defined values are copied; omitted keys and explicit `undefined` keep existing values. `NaN` and `Infinity` pass through without normalization.
- **`get()`** — return a copy of the camera state. Each call returns a new object.
- **`view(width, height)`** — return a copy of the world→screen `Matrix2D` for the given canvas size. Each call returns a new object. `width` and `height` are used as-is (including zero, negative, `NaN`, and `Infinity`).
- **`dispose()`** — release camera state. Idempotent.

### `CameraState`

| Field | Default | Description |
|-------|---------|-------------|
| `x` | `0` | camera center X in world space |
| `y` | `0` | camera center Y in world space |
| `rotation` | `0` | rotation in radians |
| `zoom` | `1` | isotropic scale (`sx = sy = zoom`) |

Defaults: `{ x: 0, y: 0, rotation: 0, zoom: 1 }`.

### `Matrix2D`

Canvas 2D affine matrix (`a`, `b`, `c`, `d`, `e`, `f`) compatible with `CanvasRenderingContext2D.setTransform`.

### View matrix

`view(width, height)` composes as **T(width/2, height/2) × R × S(zoom) × T(−x, −y)** — camera inverse translate, isotropic scale, rotate, then translate to screen center. The camera center maps to the screen center.

Negative `zoom` passes through as a flip. Zero `zoom` passes through (scale terms become zero).

### After `dispose()`

- `set` and `view` are no-ops.
- `get` returns a copy of the default camera state.
- `view` returns the identity matrix.
