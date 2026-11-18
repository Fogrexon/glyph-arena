# @fogrexon/glyph-arena-loop

Injectable frame loop. See also [package README](../packages/glyph-arena-loop/README.md).

## Exports

| Name | Kind |
|------|------|
| `createLoop` | function |
| `Time`, `Clock`, `RafCallback`, `Raf`, `CancelRaf`, `LoopOptions`, `Loop` | types |

This package does not import `@fogrexon/glyph-arena-input`.

## `createLoop(options)`

```ts
const loop = createLoop({
  onFrame(time) { /* ... */ },
  maxDelta?, // optional, seconds; default 0.1
  clock?,   // optional
  raf?,     // optional
  cancelRaf?, // optional
});

loop.start();
loop.stop();
loop.isRunning; // boolean
```

### Options

- **`onFrame(time: Time)`** — called each frame.
- **`maxDelta?: number`** — the largest step `delta` may report, in seconds. Default `0.1`. This is the game's own number: a body that moves 800 px/s wants a smaller step than one that moves 360, and passing it here means the `delta` a frame receives **is** the step the world sees — no `Math.min(time.delta, …)` at the top of `onFrame`. Only `delta` is clamped; `elapsed` keeps reporting real time. `0`, negative and non-finite values throw a `RangeError` at construction (a zero step is a game that silently never moves). A value above `0.1` is allowed and is the caller's tunnelling risk: 0.1 is what the demo's collision sizes are safe against.
- **`clock?(): number`** — returns milliseconds. Defaults to `performance.now`.
- **`raf?(callback): number`** — schedules the next frame. Defaults to `requestAnimationFrame`.
- **`cancelRaf?(handle)`** — cancels a scheduled frame. Optional; when omitted, `stop` sets `isRunning = false` and late rAF callbacks are ignored.

### `Time`

All values are in **seconds**.

| Field | Description |
|-------|-------------|
| `elapsed` | Time since `start()` |
| `delta` | Time since the previous frame, capped at `maxDelta` (0.1 s by default) |
| `frame` | Frame index |

First frame: `delta = 0`, `frame = 0`.

### Lifecycle

- **`start()`** — begins the loop. No-op if already running.
- **`stop()`** — stops the loop. No-op if already stopped.
- **`isRunning`** — `true` while the loop is active.

### Error handling

If `onFrame` throws, `isRunning` becomes `false`, the error propagates, and no further frames are scheduled.

### Late callbacks

After `stop()`, any rAF callback that was already scheduled but not yet run is ignored (the tick checks `isRunning` first). When `cancelRaf` is provided, `stop` also cancels the pending handle.
