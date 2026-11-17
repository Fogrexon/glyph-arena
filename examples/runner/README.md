# Runner

The self-drawn 2D platformer slice. One sentence: **run right, jump the gaps, do not touch the spikes or
the walker, and reach the flag.** There is one level and no randomness — the layout is a text grid in
`src/level.ts`, so a diff shows it and a test checks its shape without a browser.

Play: <https://fogrexon.github.io/glyph-arena/runner/>

Everything is drawn in `src/main.ts` - there are no image assets and no third-party art. Only the loop and
the input are borrowed from the workspace (`glyph-arena-loop`, `glyph-arena-input`, `glyph-arena-actions`).

## The three pages

The site is three demos and the generated API pages, each at its own URL:

| Page | URL | What it is |
|---|---|---|
| pickup | <https://fogrexon.github.io/glyph-arena/> | the top-down pickup demo, on the root page |
| parry | <https://fogrexon.github.io/glyph-arena/parry/> | the parry demo |
| runner | <https://fogrexon.github.io/glyph-arena/runner/> | this slice |
| API docs | <https://fogrexon.github.io/glyph-arena/docs/> | `docs/*.md` rendered to HTML |

**Nothing links them to each other.** Measured on 2026-11-17: the root page has no `<a>` element at all,
and `/docs/` links its 15 API pages and `../index.html`, nothing else. The URL is the only entrance, which
is what the table is for.

## Controls

| | Keyboard | Touch |
|---|---|---|
| start | `Space` | tap anywhere on the screen |
| run | `ArrowLeft` / `ArrowRight` (or `A` / `D`) | the `◀` / `▶` pads, bottom left |
| jump | `Space` (or `ArrowUp`, `W`, `Z`); a short tap is a short jump | the `▲` pad, bottom right |
| retry from the last safe ground | `Esc` | — |
| back to the title | `R` | — |

The title screen and the in-game hint follow the device. Keyboard: `Space — start`, then
`Arrows / A D · Space jump · Esc retry · R title`. Touch: `Tap — start`, then
`Left / right pads, jump on the right`.

**There is no touch restart.** Measured on a touch-capable page after reaching the goal: a tap in the
middle and a tap on the jump pad both leave the game on `deaths: n · R to run it again`, and there is no
`R` on a phone, so reloading the page is the only way back. Dying is not affected — the death pause
respawns by itself (measured `respawnInMs 600`, then back in `play`).

## Measured on the published build

All of the below was measured on <https://fogrexon.github.io/glyph-arena/runner/> on 2026-11-17, against
`assets/index-89vl59Nj.js` — the bundle `docs/bundles.json` records for `runner`.

- **Start**: a held `Space` goes `title → play`, and `R` returns to `title`.
- **Run**: `ArrowRight` for 0.5 s moved the body `x 70 → 212.8`; `D` for 0.4 s moved it `309.8 → 420.7`.
- **Jump**: `Space` from a standing start lifted `y 324 → 219.5` — a **104.5 px** rise against the 111 px apex the physics publishes.
- **Retry**: `Esc` in the air at `x 246.9` (`grounded: false`) put the body back at `x 199.7`, `y 324`, `grounded: true`.
- **The pit** (the gap in the ground) killed at `x 1211` on desktop and `x 1210` on a 390x844 touch screen, `cause: "pit"`; the death screen printed `x 1211 / pit · 5.3s` (5.9 s on touch).
- **Respawning** brought the body back to `x 1084`, `grounded: true`, `deaths: 1`.
- **The walker and the spikes** are the other two kills: a scripted run holding right and jumping on a 130 ms cycle died five times before the flag — four spikes around `x 1645`-`1738` and the pit at `x 1208`.
- **The goal** sits at `goalX 2368` in a `worldWidth 2432` world; the goal screen prints `GOAL`, `deaths: 5 · R to run it again` and the same last-death line.
- **Console errors**: 0 on the title, in play, on the death screen and on the goal screen.

A **synthetic press shorter than a frame is never seen**: `press("Space")` (0 ms) left the game on the
title, while holding it for 180 ms started it. A harness driving this game has to hold its presses for
about 150 ms, or it will drive nothing and report it as broken.

## The numbers that decide the feel

`src/physics.ts` is the one place they live, and `test/physics.test.ts` pins them:

| | |
|---|---|
| jump | 760 px/s (apex 111 px, 0.58 s in the air) |
| gravity | 2600 px/s2 |
| coyote | 0.09 s |
| jump buffer | 0.12 s (longer on purpose: a press just before landing still jumps) |

## State mirror

`window.__runnerState` is the read-only mirror the acceptance E2E reads, so no check has to guess from the
pixels. The field set below is what the published build actually carries:

| Field | What it is |
|---|---|
| `phase` | `title` / `play` / `dead` / `goal` |
| `x`, `y` | the body's top-left corner, world px |
| `vx`, `vy` | its velocity, px/s |
| `grounded` | standing on a solid tile |
| `deaths` | how many deaths this page load — a number, not a list |
| `deathLog` | every death this page load, oldest first: `{ x, cause, simMs }` |
| `respawnInMs` | milliseconds left in the death pause, `0` outside it |
| `cameraX` | left edge of the view, world px |
| `level`, `levelCount` | which level is loaded (1-based) and how many the run has |
| `goalX` | the flag's x (2368) |
| `worldWidth` | the level's width (2432) |
| `simMs` | milliseconds of play in this run |
| `jumpHeight` | the apex the physics gives (111) |
| `gravity` | px/s2 (2600) |
| `enemies` | every walker on the level, always an array: `{ x, y, w, h, dir, mode, speed, minX, maxX }` |

A `deathLog` entry carries its cause as `pit`, `spike` or `enemy` — `enemy` is the walker, because calling
that one a spike would make the data lie. The death screen and the log print the same line from the same
function, so the number a player reads and the number a harness reads cannot drift.
