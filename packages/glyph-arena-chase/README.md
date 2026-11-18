# @fogrexon/glyph-arena-chase

Whether a pursuer should be walking toward something, and which way. One pure call per frame:

```ts
const chase = chaseTarget(
  { x: enemy.x, w: enemy.w, dir: enemy.dir },
  { x: player.x, w: player.w },
  { sightPx: 224, stepTolerancePx: 0 },
  (dir) => stepAhead(enemy, dir),
);
```

It returns `{ noticed, dir, distancePx, walkable }` and does nothing else: no state, no speed, no
`dt`, no defaults. The ground is probed **in the direction it is about to walk**, so "the way it
looks" and "the way it walks" cannot disagree.

Part of the [`@fogrexon/glyph-arena`](../glyph-arena/README.md) runtime.
