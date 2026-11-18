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
| `keys` | `ReadonlySet<string>` | Down now, or pressed since the previous `snapshot()` (the latch) |
| `pointers` | `readonly PointerState[]` | Down now, or landed since the previous `snapshot()` (the latch) |

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

### The press latch

A loop samples once per frame, so a `keydown` and `keyup` that both land between two samples used to
be invisible, and every mechanical test had to hold a key for 150 ms. A press that ends before the
frame runs is now reported for that one frame, so `actions.pressed()` still sees the edge. It is one
frame, not a hold: `snapshot()` consumes the latch, so call it once per frame. Auto-repeat is not a
second press.

### The pointer latch

A click or a tap that lands and lifts between two frames used to be invisible — the title screen never
started, a menu item never fired. A press that ended before the frame runs now appears in `pointers`
for that one frame, at the position it landed at, so `createTouchControls` and any menu handler see
it. A pointer that is still down answers with its live position and is listed once. Same latch as the
keys, same one-frame life.

### State clearing

- **`detach()`** clears keys, the latch and pointers.
- **`blur`** on the attached target clears keys, the latch and pointers.
- Without `blur`, keys can remain held after focus loss.

### `dispose()`

Detaches listeners, clears state, and prevents further listener registration. Subsequent events on a previously attached target are not tracked. `attach()` after `dispose()` is a no-op.
