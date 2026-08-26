# @fogrexon/glyph-arena-gamepad

Gamepad state snapshot reader. See also [package README](../packages/glyph-arena-gamepad/README.md).

## Exports

| Name | Kind |
|------|------|
| `createGamepad` | function |
| `GamepadState`, `GamepadReader`, `CreateGamepadOptions` | types |

This package does not import sibling `@fogrexon/glyph-arena-*` packages.

## `createGamepad(options?)`

```ts
const gamepad = createGamepad({ getGamepads? });

const pads = gamepad.snapshot();
gamepad.dispose();
```

### Options

- **`getGamepads?`** — inject gamepad enumeration. Defaults to `navigator.getGamepads()` when available; otherwise returns an empty list.

### Methods

- **`snapshot()`** — return connected gamepads. Omits `null` slots and disconnected pads.
- **`dispose()`** — mark disposed. After dispose, `snapshot()` returns an empty array.

### `GamepadState`

| Field | Type | Description |
|-------|------|-------------|
| `index` | `number` | gamepad index |
| `id` | `string` | gamepad id string |
| `buttons` | `readonly boolean[]` | pressed state per button |
| `axes` | `readonly number[]` | raw axis values (no deadzone) |

Button and axis arrays are copied so caller mutation does not affect the next snapshot.

### Errors

When `getGamepads` throws, `snapshot()` propagates the error.
