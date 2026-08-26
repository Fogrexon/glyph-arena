# @fogrexon/glyph-arena-actions

Action bindings from keyboard codes. See also [package README](../packages/glyph-arena-actions/README.md).

## Exports

| Name | Kind |
|------|------|
| `createActions` | function |
| `ActionQuery`, `Actions` | types |

This package does not import sibling `@fogrexon/glyph-arena-*` packages.

## `createActions()`

```ts
const actions = createActions();

actions.bind("jump", ["Space"]);
actions.unbind("jump");

const query = actions.tick(keys); // Iterable<string> of KeyboardEvent.code values
query.down("jump");
query.pressed("jump");
query.released("jump");

actions.dispose();
```

### Methods

- **`bind(action, codes)`** — map `action` to one or more `KeyboardEvent.code` strings. Re-binding replaces previous codes. Empty `codes` binds the action but it is always false.
- **`unbind(action)`** — remove a binding. Missing actions are no-ops.
- **`tick(keys)`** — advance one frame from the current key set. Returns an `ActionQuery` snapshot held until the next `tick`.
- **`dispose()`** — clear bindings and state. After dispose, all methods are no-ops; `tick` returns a query where all actions are false.

### `ActionQuery`

Per-tick snapshot for bound actions only.

| Method | Description |
|--------|-------------|
| `down(action)` | `true` when any bound code is in `keys` this tick |
| `pressed(action)` | `true` when `down` is true this tick and was false last tick |
| `released(action)` | `true` when `down` is false this tick and was true last tick |

Unknown or unbound actions return `false` for all queries.

### Edge behavior

- The same code may bind to multiple actions.
- Unbinding while held emits `released` on the next tick.
- Unbinding while not held does not emit `released`.
