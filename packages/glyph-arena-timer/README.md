# @fogrexon/glyph-arena-timer

Tick-driven timer scheduling for Glyph Arena.

## API

```ts
import { createTimer } from "@fogrexon/glyph-arena-timer";

const timer = createTimer();

const handle = timer.delay(1, () => {});
const interval = timer.every(0.5, () => {});

timer.tick(nowSeconds);
timer.cancel(handle);
timer.dispose();
```

### `createTimer()`

Returns a timer with:

- `delay(seconds, fn)` — fire `fn` once after `seconds` from the origin (first tick). Returns a handle.
- `every(seconds, fn)` — fire `fn` every `seconds`; first fire after one interval (not immediately). Returns a handle.
- `cancel(handle)` — cancel a scheduled callback. Unknown handles are no-ops.
- `tick(nowSeconds)` — advance time. `nowSeconds` must be monotonically non-decreasing; backward ticks are ignored.
- `dispose()` — clear all pending callbacks. After dispose, all methods are no-ops.

### Behavior

- Time is in seconds. Nothing runs until `tick()` is called.
- The first `tick()` sets the time origin. Schedules created before that tick are measured from the origin.
- `delay(0)` and `every(0)` fire on the next `tick()` after they become due.
- Negative `seconds` do not schedule (returns a handle that `cancel` accepts as a no-op).
- If a callback throws, other due callbacks still run; the first error is rethrown after the tick finishes.
- Cancelling during a callback prevents rescheduling (`every`).
