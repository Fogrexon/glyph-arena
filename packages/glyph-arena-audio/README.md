# @fogrexon/glyph-arena-audio

Web Audio playback for Glyph Arena.

## API

```ts
import { createAudio } from "@fogrexon/glyph-arena-audio";

const audio = createAudio();
// or: createAudio({ context: existingContext })

const buffer = await audio.decode(bytes);
const handle = audio.play(buffer, { gain: 0.8, loop: false });

await audio.resume();
audio.stop(handle);
audio.dispose();
```

### `createAudio({ context? })`

Returns audio helpers:

- `decode(bytes)` — decode `ArrayBuffer` via `AudioContext.decodeAudioData`. Rejects on corrupt bytes.
- `play(buffer, { gain?, loop? })` — play an `AudioBuffer`. Returns a handle. `gain` defaults to `1` (clamped `0..1`). `loop` defaults to `false`.
- `stop(handle)` — stop playback. Unknown or already-ended handles are no-ops.
- `resume()` — call `AudioContext.resume()`. Caller must invoke after a user gesture when required.
- `dispose()` — stop in-progress playback. Reject in-flight `decode` and `resume`. Close the context only when this instance created it.

### Behavior

- Omit `context` to create and own a new `AudioContext`; pass `context` to borrow an existing one (never closed on `dispose`).
- After `dispose`, `decode` and `resume` reject; `play` returns a handle without starting sound; `stop` is a no-op.
- `resume` is never called automatically.
- `play` while `context.state` is `suspended` still returns a handle; sound starts after the caller resumes the context.
