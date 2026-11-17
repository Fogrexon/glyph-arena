# Runner

The self-drawn 2D platformer slice: one level, run right, jump the gaps, do not touch the spikes or the
walker, reach the flag.

Everything is drawn in `src/main.ts` - there are no image assets and no third-party art. Only the loop and
the input are borrowed from the workspace (`glyph-arena-loop`, `glyph-arena-input`, `glyph-arena-actions`).

## Controls

- `ArrowLeft` / `ArrowRight` (or `A` / `D`) - run
- `Space` (or `ArrowUp`, `W`, `Z`) - jump; a short tap is a short jump
- `Esc` - retry from the last safe ground, `R` - back to the title
- Touch: left and right pads bottom-left, jump bottom-right

## The numbers that decide the feel

`src/physics.ts` is the one place they live, and `test/physics.test.ts` pins them:

| | |
|---|---|
| jump | 760 px/s (apex 111 px, 0.58 s in the air) |
| gravity | 2600 px/s2 |
| coyote | 0.09 s |
| jump buffer | 0.12 s (longer on purpose: a press just before landing still jumps) |

## State mirror

`window.__runnerState` carries `phase` (`title` / `play` / `dead` / `goal`), `x`, `y`, `vx`, `vy`,
`grounded`, `deaths`, `respawnInMs`, `cameraX`, `goalX`, `worldWidth`, `simMs`, `jumpHeight`, `gravity` -
the same contract the acceptance E2E reads, so no check has to guess from the pixels.
