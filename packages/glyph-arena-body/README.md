# @fogrexon/glyph-arena-body

A platformer body for Glyph Arena: gravity, a run with acceleration, a jump with coyote time and an
input buffer, and axis-separated collision against a solid test you supply.

## API

```ts
import { createBody, jumpHeightOf, stepBody } from "@fogrexon/glyph-arena-body";

const config = {
  gravity: 2600, jumpVelocity: -760, maxFall: 1200,
  coyoteSeconds: 0.09, jumpBufferSeconds: 0.12,
  runSpeed: 320, runAccel: 2600, airAccel: 1700,
  groundFriction: 2400, airFriction: 400,
};

const body = createBody({ x: 70, y: 200, w: 20, h: 28 }, config);

// every frame
stepBody(body, { right: true, jumpHeld: true }, dt, solidAt, { grid: 32 });

console.log(jumpHeightOf(config)); // 111.08 px — v² / 2g, from the same config
```

### `createBody(box, config)`

`box` is `{ x, y, w, h }`. Returns a `Body` with `vx`, `vy`, `grounded`, `coyote`, `jumpBuffer`,
and the `config` it was made with. `grounded` starts `false`.

### `stepBody(body, input, dt, solid, options?)`

- `input` — `{ left?, right?, jump?, jumpHeld? }`. `jump` is the press (an edge), `jumpHeld` is
  whether the button is still down, which is what makes a jump variable.
- `solid(left, top, right, bottom)` — is that box solid? Called at most twice per axis per step.
- `options.grid` — cell size. When given, a blocked move snaps to the cell boundary; without it the
  move is reverted and the body keeps the last position it could stand in.
- `dt <= 0` or a non-finite `dt` does nothing.

`grounded` is recomputed from the vertical move every step and never carried over.

### `jumpHeightOf(config)`

`v² / 2g` in px. Games quote the jump height in their spec and acceptance runs quote it back, so it
is computed from the same config `stepBody` uses instead of being written down twice.

## What it deliberately does not have

- **No numbers of its own** — no default gravity, no tile size, no preset. `760 / 2600` is one
  game's feel; a default here would silently become the next game's.
- **No grid inside** — the body knows only `solid()`. The tile size stays in the game.
- **No fixed timestep** — a fixed step is a separate concern; this package promises "the same `dt`
  sequence gives the same result", nothing about frame-rate independence.
