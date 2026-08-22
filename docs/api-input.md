# @fogrexon/glyph-arena-input

Keyboard and pointer input snapshot from an `EventTarget`. See also [package README](../packages/glyph-arena-input/README.md).

## Exports

| Name | Kind |
|------|------|
| `createInput` | function |
| `PointerState`, `InputSnapshot`, `Input` | types |

This package does not import `@fogrexon/glyph-arena-loop`.

Browsers without Pointer Events are out of scope.

## `createInput()`

```ts
const input = createInput();

input.attach(target);  // EventTarget (e.g. window, canvas)
input.detach();
input.snapshot();
input.dispose();
```

### Methods

- **`attach(target: EventTarget)`** — listens on `target` for `keydown`, `keyup`, `pointerdown`, `pointermove`, `pointerup`, `pointercancel`, and `blur`.
- **`detach()`** — removes listeners and clears state.
- **`snapshot(): InputSnapshot`** — returns the current input state.
- **`dispose()`** — detaches, clears state, and marks the instance disposed.

### `InputSnapshot`

| Field | Type | Description |
|-------|------|-------------|
| `keys` | `ReadonlySet<string>` | Held `KeyboardEvent.code` values |
| `pointers` | `readonly PointerState[]` | Active pointers |

### `PointerState`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `number` | `pointerId` |
| `x` | `number` | Raw `clientX` |
| `y` | `number` | Raw `clientY` |
| `buttons` | `number` | `buttons` bitmask |

### Attach behavior

- Attaching a **different** target detaches the previous one and clears state.
- Attaching the **same** target again is a no-op.
- When not attached, `snapshot()` returns empty keys and pointers.

### State clearing

- **`detach()`** clears keys and pointers.
- **`blur`** on the attached target clears keys and pointers.
- Without `blur`, keys can remain held after focus loss.

### `dispose()`

Detaches listeners, clears state, and prevents further listener registration. Subsequent events on a previously attached target are not tracked. `attach()` after `dispose()` is a no-op.
