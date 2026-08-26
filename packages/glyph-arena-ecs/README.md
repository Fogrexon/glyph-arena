# @fogrexon/glyph-arena-ecs

Minimal entity-component storage for Glyph Arena.

## API

```ts
import { createWorld } from "@fogrexon/glyph-arena-ecs";

const world = createWorld();

const entity = world.spawn();
world.set(entity, "position", { x: 0, y: 0 });
world.get(entity, "position");
world.has(entity, "position");
world.remove(entity, "position");
world.despawn(entity);
world.dispose();
```

### `createWorld()`

Returns a world with:

- `spawn()` — create an entity. Returns an opaque `Entity` id.
- `despawn(entity)` — remove an entity and its components. Unknown entities are no-ops. Entity ids may be reused.
- `set(entity, key, value)` — store a component by string key. Overwrites an existing key. `set(entity, key, undefined)` removes the key. Unknown entities and empty-string keys are no-ops.
- `get(entity, key)` — return the stored value, or `undefined` if the entity, key, or component is missing.
- `has(entity, key)` — return whether the entity has the key.
- `remove(entity, key)` — delete a component. Unknown entities, keys, or empty-string keys are no-ops.
- `dispose()` — despawn all living entities. After dispose, `spawn` returns an invalid entity and all methods are no-ops.

### Behavior

- `get` returns the same reference last passed to `set`.
- Entities from another world behave like missing entities.
- Empty-string keys behave like missing entities.
