# @fogrexon/glyph-arena-transform

2D local transform storage and world-matrix composition for Glyph Arena.

## API

```ts
import { createTransform } from "@fogrexon/glyph-arena-transform";

const transform = createTransform();

transform.set(node, { x: 10, rotation: Math.PI / 4 });
const local = transform.get(node);
const matrix = transform.world(node, (n) => parentOf(n));
transform.clear(node);
transform.dispose();
```

### `createTransform()`

Returns a transform store with:

- `set(node, local)` — register or update a node's local transform. `local` is a partial `{ x, y, rotation, scaleX, scaleY }`; omitted keys keep existing values (or defaults when unregistered). Numeric values are copied.
- `get(node)` — return a copy of the local transform. Unregistered nodes return defaults. Does not register the node.
- `clear(node)` — unregister a node. No-op for unknown nodes.
- `world(node, parentOf)` — return `{ a, b, c, d, e, f }` in canvas `setTransform` order. Walks `parentOf` from child to root and composes `parent × local`. Unregistered locals act as identity.
- `dispose()` — release state. After dispose, `set`, `clear`, and `world` are no-ops; `get` returns defaults; `world` returns identity without calling `parentOf`.

### Defaults

`{ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }`

### Local matrix

Local transforms compose as **T × R × S** (scale, then rotate, then translate). `rotation` is in radians with the same sense as canvas `rotate`.

### Non-object nodes

`null`, `undefined`, and primitives: `set` and `clear` are no-ops; `get` returns defaults; `world` returns identity and does not call `parentOf`.

### Cycles

If `parentOf` cycles, the node just before the re-visit is treated as root. Locals up to that cut are still included.
