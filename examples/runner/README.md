# Runner

The self-drawn 2D platformer slice. One sentence: **run right, jump the gaps, do not touch the spikes or
the walker, and reach the flag.** There are three levels and no randomness — each layout is a text grid in
`src/level.ts`, so a diff shows it and a test checks its shape without a browser. A clear runs straight into
the next level (`LEVEL 2` / `LEVEL 3` for a moment, HUD `level k / 3`); the goal screen comes after the
third flag.

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

**One band joins the demos.** Measured on 2026-11-17: `/`, `/parry/` and `/runner/` each carry the same
fixed `nav.gallery-nav` strip at the bottom of the viewport (`position: fixed; inset: auto 0 0 0;
height: 20px`) with four links — Pickup, Parry, Runner, API Docs — and the page you are on is marked
`aria-current="page"`. The API pages are the exception: `/docs/` has no such strip and links
`../index.html` from its own header, so from the docs the way to a demo is that link or the back button.

## The three levels

All three are ASCII grids in `src/level.ts` (`LEVEL_ONE`, `LEVEL_TWO`, `LEVEL_THREE`) on 32 px tiles, and the
column numbers below are the grid's own columns. A clear runs straight into the next level.

| Level | Columns | What the ground asks of you | Flag |
|---|---|---|---|
| 1 | 76 | a pit at 34-36; spikes at 52-54 hanging above the floor, so they catch a jump rather than a run; one walker | `goalX 2368` in `worldWidth 2432` |
| 2 | 66 | a pit at 16-17; a **one-tile step at column 30**; spikes on the plateau at 36-38; no walker | `goalX 2048` in `worldWidth 2112` |
| 3 | 78 | **spikes on the floor at 10-11**; a one-tile step at 16-25 with spikes on top at 22-23; a walker at 32-37; pits at 40-42 and 58-60 with spikes just past the first landing | `goalX 2432` in `worldWidth 2496` |

Level 2 adds exactly one thing (height) because two new things at once would stop the level from saying what
killed you. Level 3 is where the ground stops being a corridor: the floor spikes at columns 10-11 kill a
runner who only holds right, so the pressure comes from the level's own geometry rather than from a faster
enemy. Two lanes on level 3 are reserved by tests, not by taste: **`chaseSightLane()` is columns 3-8**
(x 96-288, the level's only long straight) and **`chaseSpawnLane()` is columns 12-14**, kept flat because that
is where the pursuit enemy goes next.

## Controls

| | Keyboard | Touch |
|---|---|---|
| start | `Space` | tap anywhere on the screen |
| run | `ArrowLeft` / `ArrowRight` (or `A` / `D`) | the `◀` / `▶` pads, bottom left |
| jump | `Space` (or `ArrowUp`, `W`, `Z`); a short tap is a short jump | the `▲` pad, bottom right |
| retry from the last safe ground | `Esc` | tap the screen while the death report is up |
| back to the title | `R` | — |
| the goal screen | `R` → title (the title starts level 1) | tap anywhere → replay this level from its start |

The title screen and the in-game hint follow the device. Keyboard: `Space — start`, then
`Arrows / A D · Space jump · Esc retry · R title`. Touch: `Tap — start`, then
`Left / right pads, jump on the right`.

**The result screens are buttons.** Measured on a 390x844 touch screen: a tap while the death report is up
ends the 0.6 s pause immediately (`respawnInMs 583 → 0`, back in `play` on the safe spot, `x 1082.0`). The
goal screen answers a tap the same way — measured while it was still the level-2 flag, before level 3
landed: it replays that level from its start (`x 70`), with the same `level` and `deaths`. The wording
follows the device too: on touch it printed `deaths: n · tap to run it again`, and on a keyboard the way out
of it is `R`.

## Measured on the published build

All of the below was measured on <https://fogrexon.github.io/glyph-arena/runner/> on 2026-11-17, against
`assets/index-CN4uAbEF.js`, the bundle `/runner/` served when this was measured (`docs/bundles.json` records
what each page ships now, which moves whenever the demo is rebuilt).

- **Start**: a held `Space` goes `title → play`, while a 0 ms `press("Space")` leaves it on the title; `R` returns to `title`, and starting from the title always begins at level 1.
- **Run and jump**: `ArrowRight` for 0.5 s moved the body `x 70 → 217.6`; `Space` from a standing start lifted `y 324 → 219.2`, a **104.8 px** rise against the 111 px apex the physics publishes.
- **The level-1 pit** killed at `x 1211` (`cause: "pit"`) and the death report printed `x 1211 / pit · 4.0s`.
- **The respawn is a recorded spot, not the death spot**: `__runnerState.safe` read `{ x: 1082.2, y: 324 }` and the body came back at exactly that x, `grounded: true`, `deaths: 1`. A spot only becomes safe with **96 px of clear ground** around it (300 ms at 320 px/s), which is why a spike bed cannot swallow the respawn: on level 3 the safe spot was `x 203` while the spikes that had killed the body sat at `x 320` — 97 px from its right edge.
- **Level 1 → 2 → 3**: each clear printed `LEVEL 2` / `LEVEL 3` with `climb the step, clear the spikes`, and the HUD read `level 2 / 3`, then `level 3 / 3`. Level 3 reported `goalX 2432` in `worldWidth 2496`, and its walker showed in `enemies[0]` as `{ mode: "patrol", dir: -1, speed: 55, minX: 1024, maxX: 1184 }` — walking back at the runner, not away.
- **Holding right on level 3** dies on the floor spikes at `x 304` (`cause: "spike"`), and holding it again after the respawn dies again about 0.3 s later: that is the walk back into them from 100 px away, not the 17 ms respawn-inside-the-hazard loop #179 removed.
- **Console errors**: 0 across the three levels.

A **synthetic press shorter than a frame is never seen**: `press("Space")` (0 ms) left the game on the title while holding it for 170 ms started it, and the jump is variable, so a 90 ms hold is cut before the apex. A harness driving this game has to hold its presses — about 150 ms for a press, longer for a full-height jump — or it will drive nothing and report it as broken.

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
| `safe` | the spot a death returns you to: the last ground stood on with 96 px of clear space around it, `{ x, y }` in world px |
| `goalX` | the current level's flag, world px (levels 1 / 2 / 3: 2368 / 2048 / 2432) |
| `worldWidth` | the current level's width, world px (levels 1 / 2 / 3: 2432 / 2112 / 2496) |
| `simMs` | milliseconds of play in this run |
| `jumpHeight` | the apex the physics gives (111) |
| `gravity` | px/s2 (2600) |
| `enemies` | every enemy on the level, always an array: `{ x, y, w, h, dir, mode, speed, minX, maxX }`; `mode` is `patrol` or `chase`, so a walker and a pursuer are the same shape |

A `deathLog` entry carries its cause as `pit`, `spike` or `enemy` — `enemy` is the walker or the pursuer,
because calling either a spike would make the data lie. The death screen and the log print the same line
from the same function, so the number a player reads and the number a harness reads cannot drift.
