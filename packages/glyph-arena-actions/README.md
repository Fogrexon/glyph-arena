# @fogrexon/glyph-arena-actions

Keyboard action bindings for Glyph Arena.

## API

```ts
import { createActions } from "@fogrexon/glyph-arena-actions";

const actions = createActions();

actions.bind("jump", ["Space"]);
actions.bind("left", ["ArrowLeft"]);

const query = actions.tick(keys);
query.down("jump");
query.pressed("jump");
query.released("jump");

actions.unbind("jump");
actions.dispose();
```

### `createActions()`

Returns an actions manager with:

- `bind(action, codes)` — bind `action` to `KeyboardEvent.code` strings. Re-binding the same `action` replaces its codes.
- `unbind(action)` — remove a binding. Missing actions are no-ops.
- `tick(keys)` — `keys` is an `Iterable<string>` of active key codes. Returns `{ down(action), pressed(action), released(action) }` for this tick.
- `dispose()` — release state. After dispose, `bind`, `unbind`, and `tick` are no-ops; `tick` returns all-false queries.

### Query semantics

- `down(action)` — any bound code is present in `keys`.
- `pressed(action)` — `down` this tick and not `down` on the previous tick.
- `released(action)` — not `down` this tick but was `down` on the previous tick.
- Unbound or unknown actions: all query methods return `false`.
- The query object returned by `tick()` is a snapshot for that tick; it does not change on later ticks.
- The same `KeyboardEvent.code` may bind to multiple actions; each is evaluated independently.
- Binding with an empty `codes` array keeps the action bound but always `false`.
