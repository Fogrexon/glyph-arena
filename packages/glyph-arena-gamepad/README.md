# @fogrexon/glyph-arena-gamepad

Polling gamepad snapshots for Glyph Arena.

## API

```ts
import { createGamepad } from "@fogrexon/glyph-arena-gamepad";

const gamepad = createGamepad();

gamepad.snapshot(); // readonly { index, id, buttons, axes }[]
gamepad.dispose();
```

### `createGamepad({ getGamepads? })`

Returns a gamepad reader with:

- `snapshot()` — poll connected gamepads. Returns `{ index, id, buttons, axes }[]`.
- `dispose()` — release the reader. After dispose, `snapshot()` returns `[]`.

Optional `getGamepads` defaults to `navigator.getGamepads` (injectable for tests).

### Snapshot fields

- `index` — gamepad index
- `id` — gamepad id string
- `buttons` — `boolean[]` from `GamepadButton.pressed`
- `axes` — raw axis values (no deadzone)

### Behavior

- Omits pads where `connected` is `false`
- Skips `null` slots from `getGamepads()`
- Copies button and axis arrays so caller mutation does not affect the next snapshot
- If `navigator` or `getGamepads` is missing, `snapshot()` returns `[]`
- If `getGamepads` throws, the error propagates
- Polling only; no rumble, remap, connection events, or standard mapping conversion
