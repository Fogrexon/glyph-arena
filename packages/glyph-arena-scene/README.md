# @fogrexon/glyph-arena-scene

Hierarchical scene graph nodes for Glyph Arena.

## API

```ts
import { createForest } from "@fogrexon/glyph-arena-scene";

const forest = createForest();

const root = forest.create();
const child = forest.create();

forest.setParent(child, root);
forest.parent(child);
forest.children(root);
forest.destroy(child);
forest.dispose();
```

### `createForest()`

Returns a forest with:

- `create()` — create a root node (`parent` is `null`). Returns an opaque `Node`.
- `destroy(node)` — destroy `node` and its entire subtree.
- `setParent(child, parent | null)` — move `child` under `parent`, or re-root when `parent` is `null`.
- `parent(node)` — return the parent `Node`, or `null` for roots and invalid nodes.
- `children(node)` — return a readonly copy of direct child nodes.
- `dispose()` — invalidate every node in this forest. After dispose, all nodes behave as missing.

### Contracts

- Cyclic `setParent` is a no-op, including `setParent(node, node)`.
- Missing nodes, nodes from another forest, and nodes after `dispose` are invalid: `parent` returns `null`, `children` returns `[]`, mutating methods are no-ops.
- Operations on destroyed nodes are no-ops.
- `setParent` is a move: remove from the old parent's children, append to the new parent's end.
- `setParent(child, missingParent)` is a no-op; only `null` re-roots.
- Destroyed node ids may be reused by later `create()` calls.
