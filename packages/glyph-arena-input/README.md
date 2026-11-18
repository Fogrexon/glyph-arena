# @fogrexon/glyph-arena-input

Keyboard and pointer input snapshot for Glyph Arena.

## API

```ts
import { createInput } from "@fogrexon/glyph-arena-input";

const input = createInput();

input.attach(target); // EventTarget (e.g. window, canvas)
input.detach();
input.snapshot(); // { keys: ReadonlySet<string>, pointers: readonly PointerState[] }
input.dispose();
```

### Snapshot

- `keys` — `KeyboardEvent.code` values that are **down now, or went down since the previous
  `snapshot()`**. The second half is the latch: a press that ends between two frames still answers
  for that one frame, so `actions.pressed()` sees the edge instead of losing it.
- `pointers` — active pointers with `{ id, x, y, buttons }` (raw `clientX`/`clientY`)

### The press latch

A loop samples once per frame, so a keydown and keyup that both land between two samples used to be
invisible — every mechanical test had to hold a key for 150 ms before letting go, which is a property
of the harness and not of the game. A press that is gone by the time the frame runs is now reported
for that one frame.

It is **one frame, not a hold**: a keyboard is discrete events and nothing needs a key to stay down
after the player let go. `snapshot()` consumes the latch, so call it once per frame — as the loop
does.

### Behavior

- Attaching a different target detaches the previous one; same target is a no-op
- `detach` and `blur` clear keys, the latch and pointers
- Without `blur`, keys may remain held after focus loss
- Auto-repeat (`keydown` again while the key is held) is not a second press
- After `dispose`, `attach` is a no-op and `snapshot` stays empty; `detach` remains safe
