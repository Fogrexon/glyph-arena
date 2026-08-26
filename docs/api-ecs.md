# @fogrexon/glyph-arena-ecs

Minimal entity-component storage. See also [package README](../packages/glyph-arena-ecs/README.md).

## Exports

| Name | Kind |
|------|------|
| `createWorld` | function |
| `Entity`, `World` | types |

This package does not import sibling `@fogrexon/glyph-arena-*` packages.

## `createWorld()`

```ts
const world = createWorld();

const entity = world.spawn();
world.set(entity, "stats", { hp: 10 });
world.get(entity, "stats");
world.has(entity, "stats");
world.remove(entity, "stats");
world.despawn(entity);
world.dispose();
```

### Methods

- **`spawn()`** — create an entity. Returns a numeric `Entity` id. Reuses ids from despawned entities.
- **`despawn(entity)`** — remove entity and all components. Missing entities are no-ops.
- **`set(entity, key, value)`** — store a component. `undefined` removes the key. Empty-string keys are ignored. Missing entities are no-ops.
- **`get(entity, key)`** — read a component, or `undefined` when missing. Empty-string keys return `undefined`.
- **`has(entity, key)`** — whether the key exists. Empty-string keys return `false`.
- **`remove(entity, key)`** — delete a component key. Missing entities or keys are no-ops.
- **`dispose()`** — clear all entities and components. After dispose, all methods are no-ops; `spawn` returns ids that cannot store components.

### `Entity`

`number` — opaque entity id.

### Notes

- `set` on the same key overwrites the previous value.
- Entities from another world behave like missing entities.
- After `dispose`, newly spawned entities are invalid for storage.
