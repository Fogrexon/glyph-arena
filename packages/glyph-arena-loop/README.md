# @fogrexon/glyph-arena-loop

Injectable frame loop for Glyph Arena.

## API

```ts
import { createLoop } from "@fogrexon/glyph-arena-loop";

const loop = createLoop({
  onFrame(time) {
    // time.elapsed — seconds since start
    // time.delta — seconds since previous frame (0 on first frame)
    // time.frame — frame index (0 on first frame)
  },
});

loop.start();
loop.stop();
loop.isRunning;
```

### Options

- `onFrame(time)` — called each frame
- `clock?()` — returns milliseconds (defaults to `performance.now`)
- `raf?(cb)` — schedule next frame (defaults to `requestAnimationFrame`)
- `cancelRaf?(handle)` — optional; if omitted, `stop` ignores late callbacks

### Behavior

- `start` while running and `stop` while stopped are no-ops
- First frame: `delta = 0`, `frame = 0`
- If `onFrame` throws, the loop stops and the error propagates
