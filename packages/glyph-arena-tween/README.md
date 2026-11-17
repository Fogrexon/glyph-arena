# @fogrexon/glyph-arena-tween

Tick-driven scalar tweening for Glyph Arena.

## API

```ts
import { createTween } from "@fogrexon/glyph-arena-tween";

const tween = createTween();

const handle = tween.to(0, 10, 1);
const value = tween.get(handle);

tween.tick(nowSeconds);
tween.cancel(handle);
tween.dispose();
```

### `createTween()`

Returns a tween runner with:

- `to(from, to, durationSeconds, ease?)` — start a scalar tween. Returns an opaque handle. Optional `ease(t)` receives `t` clamped to `0..1`; omitted ease is linear (`t => t`). Negative `durationSeconds` returns an invalid handle.
- `get(handle)` — current interpolated value, or `undefined` if missing, cancelled, completed, or before the first tick.
- `cancel(handle)` — stop a tween. Unknown handles are no-ops.
- `tick(nowSeconds)` — advance time. `nowSeconds` must be monotonically non-decreasing; backward ticks are ignored; repeated identical times do not advance.
- `dispose()` — clear all tweens. After dispose, all methods are no-ops and `to` returns invalid handles.

### Behavior

- Time is in seconds. Nothing advances until `tick()` is called.
- The first `tick()` sets the time origin. Tweens created before that tick start at the origin.
- In progress: `from + (to - from) * ease(u)` where `u = clamp(elapsed / duration, 0, 1)`.
- `durationSeconds === 0` completes on the next `tick()`; `get` is `undefined` afterward.
- After the completing `tick()`, `get` is `undefined` (the final value is not retained).
- If `ease` throws, that tween is removed; other tweens continue; the first error is rethrown.

### `approach(current, aim, dt, options?)`

Move `current` toward `aim` by `rate` per second and return the new value. This is the scalar
version of a camera, a health bar that drains smoothly, or a steering value that must not snap: the
aim may move every frame, there is no duration and no completion, so there is nothing to cancel.

```ts
import { approach } from "@fogrexon/glyph-arena-tween";

let cameraX = 0;

// every frame
cameraX = approach(cameraX, body.x - viewWidth * 0.33, dt, { rate: 8 });
```

- `rate` — how much of the remaining gap to close per second. Default `8`.
- The step is `clamp(dt * rate, 0, 1)`, so a long frame (a stall, a tab switch) closes the whole gap
  instead of overshooting it and bouncing back. `dt <= 0` or a non-finite `dt` returns `current`
  unchanged, which is what a paused frame should do.
- Not `to()`: a tween has a fixed duration and an end; this chases a moving aim forever.
