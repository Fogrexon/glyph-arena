# @fogrexon/glyph-arena-timer

Tick-driven timer scheduling for Glyph Arena. See also [package README](../packages/glyph-arena-timer/README.md).

## Exports

| Name | Kind |
|------|------|
| `createTimer` | function |
| `TimerHandle`, `Timer` | types |

This package does not import `@fogrexon/glyph-arena-loop` or `@fogrexon/glyph-arena-input`. It has no `Time`, rAF, or clock types.

## `createTimer()`

```ts
const timer = createTimer();

const handle = timer.delay(1, () => {});
const interval = timer.every(0.5, () => {});

timer.tick(nowSeconds);
timer.cancel(handle);
timer.dispose();
```

### Methods

- **`delay(seconds, fn)`** — fire `fn` once after `seconds` from the origin (first tick). Returns a handle.
- **`every(seconds, fn)`** — fire `fn` every `seconds`; first fire after one interval (not immediately). Returns a handle.
- **`cancel(handle)`** — cancel a scheduled callback. Unknown handles are no-ops.
- **`tick(nowSeconds)`** — advance time. `nowSeconds` must be monotonically non-decreasing; backward ticks are ignored.
- **`dispose()`** — clear all pending callbacks. After dispose, all methods are no-ops.

### `TimerHandle`

`number` — opaque handle returned by `delay` and `every`.

### Time

All values are in **seconds**. Nothing runs until `tick()` is called.

### Origin

The first `tick()` sets the time origin. Schedules created before that tick are measured from the origin.

### Zero intervals

`delay(0)` and `every(0)` fire on the next `tick()` after they become due.

### Negative intervals

Negative `seconds` do not schedule. Returns a handle; `cancel` on that handle is a no-op.

### Error handling

If a callback throws, other due callbacks still run; the first error is rethrown after the tick finishes.

### Cancel during callback

Cancelling during a callback prevents rescheduling (`every`).
