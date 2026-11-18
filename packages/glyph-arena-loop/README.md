# @fogrexon/glyph-arena-loop

Injectable frame loop for Glyph Arena.

## API

```ts
import { createLoop } from "@fogrexon/glyph-arena-loop";

const loop = createLoop({
  onFrame(time) {
    // time.elapsed — seconds since start (never clamped)
    // time.delta — seconds since previous frame, capped at maxDelta (0 on first frame)
    // time.frame — frame index (0 on first frame)
  },
});

loop.start();
loop.stop();
loop.isRunning;
```

### Options

- `onFrame(time)` — called each frame
- `maxDelta?: number` — the largest step `delta` may report, in seconds (default `0.1`). Pass the
  game's own step here instead of clamping `time.delta` at the top of `onFrame`. Only `delta` is
  clamped. `0`, negative and non-finite throw a `RangeError` at construction; above `0.1` is the
  caller's tunnelling risk.
- `clock?()` — returns milliseconds (defaults to `performance.now`)
- `raf?(cb)` — schedule next frame (defaults to `requestAnimationFrame`)
- `cancelRaf?(handle)` — optional; if omitted, `stop` ignores late callbacks

### Behavior

- `start` while running and `stop` while stopped are no-ops
- First frame: `delta = 0`, `frame = 0`
- If `onFrame` throws, the loop stops and the error propagates
