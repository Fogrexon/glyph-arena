# @fogrexon/glyph-arena-chase

Whether a pursuer should be walking toward something, and which way — one pure call per frame. See
also [package README](../packages/glyph-arena-chase/README.md).

## Exports

Generated from the package's source when the docs are built — do not edit this table by hand.

## `chaseTarget(self, target, config, groundAhead)`

`self` is `{ x, w, dir }` (left edge, width, current facing), `target` is `{ x, w }`, `config` is
`{ sightPx, stepTolerancePx }` — both required, no defaults — and `groundAhead(dir)` answers how far
the ground one pixel ahead of the feet steps, in `dir`: `0` flat, `+32` a one-tile lip, `-32` a drop,
`Infinity` or `NaN` a hole.

```ts
const chase = chaseTarget(
  { x: enemy.x, w: enemy.w, dir: enemy.dir },
  { x: player.x, w: player.w },
  { sightPx: 224, stepTolerancePx: 0 },
  (dir) => stepAhead(enemy, dir),
);

if (chase.walkable) enemy.x += chase.dir * speed * dt;
```

It returns `{ noticed, dir, distancePx, walkable }`:

- `distancePx` is **centre to centre** (target minus self). Measuring from left edges makes the
  distance a box of different width notices at differ by half the width difference.
- `dir` follows the sign of the distance, and **keeps `self.dir` when the centres coincide** — a
  pursuer standing exactly on its target should not jitter.
- `noticed` includes both ends: `|distancePx| <= sightPx`.
- `groundAhead` is called **with the `dir` this call returns**, so the ground it checks is the ground
  it will walk. A hole (`±Infinity`, `NaN`) is never walkable, and `walkable` implies `noticed`.
- `stepTolerancePx` is one number for both directions: `-32` is as walkable as `32`.

Nothing else is in the package: no state (patrol, how long sight has been lost, attack modes are the
caller's memory), no speed and no `dt` (one game moves a plain `x`, the other feeds a body), and no
attack verbs.
