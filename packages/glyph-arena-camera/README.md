# @fogrexon/glyph-arena-camera

2D camera state and world-to-screen view matrix for Glyph Arena.

## API

```ts
import { createCamera } from "@fogrexon/glyph-arena-camera";

const camera = createCamera();

camera.set({ x: 100, y: 50, rotation: Math.PI / 4, zoom: 2 });
const state = camera.get();
const matrix = camera.view(800, 600);
camera.dispose();
```

### `createCamera()`

Returns a camera with:

- `set(partial)` — update camera state. `partial` is `{ x, y, rotation, zoom }`; omitted or `undefined` keys keep existing values (or defaults when never set). Numeric values are copied. Unknown keys are ignored.
- `get()` — return a copy of `{ x, y, rotation, zoom }`. Defaults: `{ x: 0, y: 0, rotation: 0, zoom: 1 }`.
- `view(width, height)` — return `{ a, b, c, d, e, f }` world→screen matrix in canvas `setTransform` order.
- `dispose()` — release state. After dispose, `set` and `view` are no-ops; `get` returns defaults; `view` returns identity.

### View matrix

Composed as **T(width/2, height/2) × R × S(zoom) × T(−x, −y)** — camera inverse translate, isotropic scale, rotate, then translate to screen center. `rotation` is in radians with the same sense as canvas `rotate`. `zoom` is isotropic (`sx = sy = zoom`).

### Defaults

`{ x: 0, y: 0, rotation: 0, zoom: 1 }`
