# @fogrexon/glyph-arena-collide

Axis-aligned bounding box overlap for Glyph Arena.

## API

```ts
import { overlaps, type Aabb } from "@fogrexon/glyph-arena-collide";

const a: Aabb = { x: 0, y: 0, width: 10, height: 10 };
const b: Aabb = { x: 5, y: 5, width: 10, height: 10 };

overlaps(a, b); // true
```

### `Aabb`

```ts
type Aabb = {
  x: number;
  y: number;
  width: number;
  height: number;
};
```

Top-left origin. Positive `width` and `height` are assumed.

### `overlaps(a, b)`

Returns `true` when two axis-aligned boxes overlap or touch on an edge or corner.

Returns `false` when:

- Either box has `width` or `height` `<= 0`
- Any field is `NaN` or `±Infinity`
- The boxes are fully separate

Inputs are not mutated.
