# @fogrexon/glyph-arena-tween

Tick-driven scalar tweening for Glyph Arena. See also [package README](../packages/glyph-arena-tween/README.md).

## Exports

| Name | Kind |
|------|------|
| `createTween` | function |
| `TweenHandle`, `Tween` | types |

This package does not import `@fogrexon/glyph-arena-timer`, `@fogrexon/glyph-arena-loop`, or other sibling packages.

## `createTween()`

```ts
const tween = createTween();

const handle = tween.to(0, 10, 1);
const value = tween.get(handle);

tween.tick(nowSeconds);
tween.cancel(handle);
tween.dispose();
```

### Methods

- **`to(from, to, durationSeconds, ease?)`** — start a scalar tween. Returns a handle. Optional `ease(t)` receives `t` clamped to `0..1`; omitted ease is linear (`t => t`). Negative `durationSeconds` returns an invalid handle.
- **`get(handle)`** — current interpolated value, or `undefined` if missing, cancelled, completed, or before the first tick.
- **`cancel(handle)`** — stop a tween. Unknown handles are no-ops.
- **`tick(nowSeconds)`** — advance time. `nowSeconds` must be monotonically non-decreasing; backward ticks are ignored; repeated identical times do not advance.
- **`dispose()`** — clear all tweens. After dispose, all methods are no-ops and `to` returns invalid handles.

### `TweenHandle`

`number` — opaque handle returned by `to`.

### Time

All values are in **seconds**. Nothing advances until `tick()` is called.

### Origin

The first `tick()` sets the time origin. Tweens created before that tick start at the origin.

### Interpolation

In progress: `from + (to - from) * ease(u)` where `u = clamp(elapsed / duration, 0, 1)`.

The return value of `ease` is not clamped. `NaN` and `Infinity` in `from` or `to` pass through without normalization.

### Zero duration

`durationSeconds === 0` completes on the next `tick()`; `get` is `undefined` afterward.

### Negative duration

Negative `durationSeconds` do not start a tween. Returns a handle; `get` and `cancel` on that handle are no-ops.

### Completion

After the completing `tick()`, `get` is `undefined` (the final value is not retained).

### Error handling

If `ease` throws, that tween is removed; other tweens continue; the first error is rethrown after the tick finishes.

### After `dispose()`

- `to` returns invalid handles.
- `get` returns `undefined`.
- `tick` and `cancel` are no-ops.
