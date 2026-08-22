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

- `keys` — currently held `KeyboardEvent.code` values
- `pointers` — active pointers with `{ id, x, y, buttons }` (raw `clientX`/`clientY`)

### Behavior

- Attaching a different target detaches the previous one; same target is a no-op
- `detach` and `blur` clear keys and pointers
- Without `blur`, keys may remain held after focus loss
- After `dispose`, `attach` is a no-op and `snapshot` stays empty; `detach` remains safe
