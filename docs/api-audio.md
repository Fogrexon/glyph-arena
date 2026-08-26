# @fogrexon/glyph-arena-audio

Web Audio playback helper. See also [package README](../packages/glyph-arena-audio/README.md).

## Exports

| Name | Kind |
|------|------|
| `createAudio` | function |
| `PlayHandle`, `PlayOptions`, `CreateAudioOptions`, `Audio` | types |

This package does not import sibling `@fogrexon/glyph-arena-*` packages.

## `createAudio(options?)`

```ts
const audio = createAudio({ context? });

const buffer = await audio.decode(bytes);
const handle = audio.play(buffer, { gain?, loop? });

audio.stop(handle);
await audio.resume();
audio.dispose();
```

### Options

- **`context?`** — existing `AudioContext`. When omitted, a new context is created and closed on `dispose`.

### Methods

- **`decode(bytes)`** — decode `ArrayBuffer` to `AudioBuffer` via `context.decodeAudioData`.
- **`play(buffer, options?)`** — start playback. Returns an opaque `PlayHandle` (`number`). Does not call `resume` automatically.
- **`stop(handle)`** — stop active playback. Unknown or already-ended handles are no-ops.
- **`resume()`** — call `context.resume()`.
- **`dispose()`** — reject pending decodes, stop all playback, and close an owned context. Borrowed contexts are not closed.

### `PlayOptions`

| Field | Description |
|-------|-------------|
| `gain?` | volume multiplier, clamped to `0..1`. Default `1`. |
| `loop?` | loop playback. Default `false`. |

### After `dispose()`

- `decode` and `resume` reject with `"Audio disposed"`.
- `play` returns a handle without starting sound.
- In-flight decodes reject when dispose runs.

### Suspended context

`play` while the context is suspended still creates sources and returns a handle. Call `resume()` to unpause the context.
