# @fogrexon/glyph-arena-collide

Axis-aligned bounding box overlap test. See also [package README](../packages/glyph-arena-collide/README.md).

## Exports

| Name | Kind |
|------|------|
| `overlaps` | function |
| `Aabb` | type |

This package does not import sibling `@fogrexon/glyph-arena-*` packages.

## `overlaps(a, b)`

```ts
const hit = overlaps(
  { x: 0, y: 0, width: 10, height: 10 },
  { x: 5, y: 5, width: 10, height: 10 },
);
```

Returns `true` when two AABBs overlap or touch on an edge. Returns `false` when boxes are separate.

### `Aabb`

| Field | Type | Description |
|-------|------|-------------|
| `x` | `number` | left edge |
| `y` | `number` | top edge |
| `width` | `number` | box width |
| `height` | `number` | box height |

### Invalid boxes

Returns `false` when either box has non-positive `width` or `height`, or any field is non-finite (`NaN`, `Infinity`).

Inputs are not mutated.
