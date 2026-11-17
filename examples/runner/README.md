# Runner

The self-drawn 2D platformer slice. One sentence: **run right, jump the gaps, do not touch the spikes or
the walker, and reach the flag.** There are two levels and no randomness — each layout is a text grid in
`src/level.ts`, so a diff shows it and a test checks its shape without a browser. Clearing level 1 runs
straight into level 2 (`LEVEL 2` for a moment, HUD `level 2 / 2`); the goal screen comes after the second
flag.

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

**The result screens are buttons.** Measured on a touch-capable page: a tap while the death report is up
ends the 0.6 s pause immediately (`respawnInMs 584 → 0`, back in `play` on the last safe ground), and a
tap on the goal screen replays the level from its start (`x 70`, same `level`, `deaths` unchanged). The
wording follows the device too — on a touch screen the goal screen printed
`deaths: n · tap to run it again`, while on a keyboard the way out of it is `R`.

## Measured on the published build

All of the below was measured on <https://fogrexon.github.io/glyph-arena/runner/> on 2026-11-17, against
`assets/index-ClwvVxu6.js` — the bundle `docs/bundles.json` records for `runner`.

- **Start**: a held `Space` goes `title → play`, and `R` returns to `title`; starting from the title always begins at level 1 (`level 1`, `x 70`), measured after leaving the goal screen with `R`.
- **Run**: `ArrowRight` for 0.5 s moved the body `x 70 → 217.6`; `D` for 0.4 s moved it `217.6 → 345.5`.
- **Jump**: `Space` from a standing start lifted `y 324 → 219.2`, a **104.8 px** rise against the 111 px apex the physics publishes.
- **Retry**: `Esc` in the air at `x 464.9` (`grounded: false`) put the body back on the ground at `x 449.2`, `grounded: true` — the last ground it stood on.
- **The pit** (the gap in the ground) killed at `x 1211` on desktop and `x 1211` on a 390x844 touch screen, `cause: "pit"`; the death report printed `x 1211 / pit · 6.0s` (4.2 s on touch).
- **Respawning** brought the body back to `x 1082`, `grounded: true`, `deaths: 1`.
- **Level 1 → 2**: crossing the level-1 flag printed `LEVEL 2` and `climb the step, clear the spikes`, and the HUD read `level 2 / 2`. Level 1's flag is at `goalX 2368` in a `worldWidth 2432` world; level 2's is at `goalX 2048` in `worldWidth 2112`.
- **The walker** on level 1 shows up in `enemies[0]` as `{ mode: "patrol", speed: 55, minX: 1280, maxX: 1504 }`.
- **The goal screen** (after the level-2 flag) printed `GOAL`, `deaths: 28 · tap to run it again` and the last death (`x 1232 / spike · 18.7s`) on a touch-capable page; a tap there went back to `play` at `x 70`, same level, same death count, and `R` from that screen went to `title`.
- **A scripted run cleared both levels with 28 deaths** — hold right, jump whenever grounded; a 125 ms jump hold gets through level 1, and level 2's spike field needed about 430 ms.
- **Console errors**: 0 on the title, in play, on the death report and on the goal screen.

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
| `goalX` | the current level's flag, world px (level 1: 2368, level 2: 2048) |
| `worldWidth` | the current level's width, world px (level 1: 2432, level 2: 2112) |
| `simMs` | milliseconds of play in this run |
| `jumpHeight` | the apex the physics gives (111) |
| `gravity` | px/s2 (2600) |
| `enemies` | every walker on the level, always an array: `{ x, y, w, h, dir, mode, speed, minX, maxX }` |

A `deathLog` entry carries its cause as `pit`, `spike` or `enemy` — `enemy` is the walker, because calling
that one a spike would make the data lie. The death screen and the log print the same line from the same
function, so the number a player reads and the number a harness reads cannot drift.
