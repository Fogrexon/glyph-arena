# @fogrexon/glyph-arena-transform

Per-node local 2D transforms and world matrix composition. See also [package README](../packages/glyph-arena-transform/README.md).

## Exports

| Name | Kind |
|------|------|
| `createTransform` | function |
| `LocalTransform`, `Matrix2D`, `Transform` | types |

This package does not import `@fogrexon/glyph-arena-scene` or other sibling packages.

## `createTransform()`

```ts
const transform = createTransform();

transform.set(node, { x: 10, y: 20 });
const local = transform.get(node);
transform.clear(node);
const matrix = transform.world(node, (n) => parentOf(n));
transform.dispose();
```

### Methods

- **`set(node, partial)`** — merge `partial` into the node’s stored local transform. Only keys present on `partial` are copied; omitted keys are unchanged. `NaN` values are stored as-is. Non-object `node` is a no-op.
- **`get(node)`** — return a copy of the node’s local transform, or the default when none is stored. Non-object `node` returns a copy of the default.
- **`clear(node)`** — remove stored local transform for `node`. Non-object `node` is a no-op.
- **`world(node, parentOf)`** — return the world `Matrix2D` for `node`. Non-object `node` returns the identity matrix.
- **`dispose()`** — release the transform store. Idempotent.

### `LocalTransform`

| Field | Default | Description |
|-------|---------|-------------|
| `x` | `0` | translation X |
| `y` | `0` | translation Y |
| `rotation` | `0` | rotation in radians |
| `scaleX` | `1` | horizontal scale |
| `scaleY` | `1` | vertical scale |

### `Matrix2D`

Canvas 2D affine matrix (`a`, `b`, `c`, `d`, `e`, `f`) compatible with `CanvasRenderingContext2D.setTransform`.

### Node identity

Nodes are keyed by object identity in a `WeakMap`. Primitives and `null` are not stored.

### Local matrix

Each local transform composes as translation × rotation × scale into a `Matrix2D`.

### `world(node, parentOf)`

`parentOf` walks from `node` toward ancestors. The walk stops when `parentOf` returns a non-object, or when the next parent would revisit an object already on the chain (cycle); the revisiting node is treated as the root of the remaining chain.

The world matrix is built from that root down: start with the root’s local matrix, then multiply each descendant’s local matrix in order down to `node`.

If `parentOf` throws, the error propagates.

### After `dispose()`

- `set` and `clear` are no-ops.
- `get` returns a copy of the default local transform.
- `world` returns the identity matrix; `parentOf` is not called.
