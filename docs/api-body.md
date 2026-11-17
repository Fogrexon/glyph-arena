# @fogrexon/glyph-arena-body

A platformer body: gravity, a run with acceleration, a jump with coyote time and an input buffer, and
axis-separated collision against a solid test you supply. See also
[package README](../packages/glyph-arena-body/README.md).

## Exports

Generated from the package's source when the docs are built — do not edit this table by hand.

## `createBody(box, config)`

`box` is `{ x, y, w, h }` and `config` is a full `BodyConfig`: `gravity`, `jumpVelocity`, `maxFall`,
`coyoteSeconds`, `jumpBufferSeconds`, `runSpeed`, `runAccel`, `airAccel`, `groundFriction`,
`airFriction` and `jumpCutFactor`, all required. The body starts with `grounded: false`, `vx` and `vy`
at `0`, and keeps the config it was made with.

```ts
const body = createBody({ x: 70, y: 120, w: 20, h: 28 }, config);
```

## `stepBody(body, input, dt, solid, options?)`

- `input` — `{ left?, right?, jump?, jumpHeld? }`. `jump` is the press (an edge), `jumpHeld` is whether the button is still down; that pair is what makes a short tap a short jump.
- `solid(left, top, right, bottom)` — is that box solid? Called at most twice per axis per step.
- `options.grid` — cell size in px. When given, a blocked move snaps to the cell boundary; without it the move is reverted and the body keeps the position it could stand in.
- `dt <= 0` or a non-finite `dt` does nothing.

```ts
stepBody(body, { right: true, jumpHeld: true }, delta, solid, { grid: 32 });
```

`grounded` is recomputed from the vertical move every step and never carried over, so a body that
walks off a ledge is not grounded on the frame it leaves.

## `jumpHeightOf(config)`

`v² / 2g` in px, from the same config `stepBody` uses, so a spec and an acceptance run cannot quote
two different numbers.

```ts
jumpHeightOf(config); // 111.08 for gravity 2600, jumpVelocity -760
```

## What it deliberately does not have

- **No numbers of its own.** No default gravity, no tile size, no preset; `jumpCutFactor` is required rather than defaulted, because a default here would silently become the next game's feel.
- **No grid inside.** The body knows only `solid()`, so the tile size stays in the game.
- **No fixed timestep.** The promise is "the same `dt` sequence gives the same result", nothing about frame-rate independence.

This package does not import sibling `@fogrexon/glyph-arena-*` packages.
