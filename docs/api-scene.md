# @fogrexon/glyph-arena-scene

Hierarchical scene graph nodes. See also [package README](../packages/glyph-arena-scene/README.md).

## Exports

| Name | Kind |
|------|------|
| `createForest` | function |
| `Node`, `Forest` | types |

This package does not import sibling `@fogrexon/glyph-arena-*` packages.

## `createForest()`

```ts
const forest = createForest();

const root = forest.create();
const child = forest.create();

forest.setParent(child, root);
forest.parent(child);
forest.children(root);
forest.destroy(child);
forest.dispose();
```

### Methods

- **`create()`** — create a root node with `parent` `null`. Returns an opaque `Node`.
- **`destroy(node)`** — destroy `node` and its entire subtree. Removes the node from its parent's children.
- **`setParent(child, parent | null)`** — move `child` under `parent`, or re-root when `parent` is `null`.
- **`parent(node)`** — return the parent `Node`, or `null` for roots and invalid nodes.
- **`children(node)`** — return a readonly copy of direct child nodes.
- **`dispose()`** — invalidate every node in this forest. After dispose, all nodes behave as missing.

### `Node`

Opaque node handle. Nodes from another forest are invalid in this forest.

### Parenting

- `setParent` is a move: remove from the old parent's children, append to the new parent's end.
- Re-parenting within the same parent moves the child to the end.
- Cyclic `setParent` is a no-op, including `setParent(node, node)`.
- `setParent(child, missingParent)` is a no-op; only `null` re-roots.

### Invalid nodes

Missing nodes, nodes from another forest, destroyed nodes, and nodes after `dispose` are invalid:

- `parent` returns `null`
- `children` returns `[]`
- `destroy`, `setParent` are no-ops

After `dispose`, `create()` returns nodes that behave as missing.

### ID reuse

Destroyed node ids may be reused by later `create()` calls.
