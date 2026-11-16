# Parry Demo

Second sample for Glyph Arena. Enemies converge from a fixed script; **dash into one** and it is
parried. A parry lands with a hitstop, a camera shake and a readout of how early the dash was.

**Flow:** title -> **Space** / **Enter** (or a tap) -> play -> **FAIL** (lives run out) or **CLEAR**
(survive all 20 waves) -> **R** restart (or a tap, on touch). Nothing is randomised: wave *n* of a page
load is always the same wave.

## Controls

| | Keyboard | Touch |
|---|---|---|
| move | arrows or stick | drag the left pad |
| dash | **Shift** or **Space** | **DASH** button (bottom right) |
| start / restart | **Space** / **Enter** / **R** | tap the screen |

The in-game hint follows the device: `Dash into it — Shift or Space` on a keyboard,
`Dash into it — tap DASH` on a touch screen. The result line follows it too — `FAIL — R restart` on a
keyboard, `FAIL — Tap to retry` on touch.

## On screen

Everything below was measured on the published build at
<https://fogrexon.github.io/glyph-arena/parry/> on 2026-11-16.

While playing, the HUD prints five lines: `Parried: n`, `Lives: 3`, `Wave: n/20`,
`Parry window: NNNms` (the live parry window) and `Contact in NNNms` (time until the next enemy
reaches you, or `Contact in —` when nothing is closing in). **The window narrows as the run goes on**
— measured 533 ms at wave 1/20, 498 ms at wave 3/20 and 463 ms at wave 5/20 — and `Contact in` is the
aim: **dash when it drops inside the window.**

```
Parried: 0
Lives: 3
Wave: 1/20

Parry window: 533ms
Contact in 4948ms
Dash into it — tap DASH
```

The result screen prints, in order:

```
Parried: 0/20
Reached wave: 7/20
Median error: —
FAIL — R restart
First run — this is the baseline
Last runs (newest first):
1. FAIL - parried 0, —, wave 7
```

The field is **cleared** on the result screen — no enemies or player are drawn behind the verdict, so
the numbers and the history are all there is to read.

- That verdict line was measured as `FAIL — R restart`; a cleared run uses the same template
  (`CLEAR — R restart`). `Median error` showed `—` while the run had no parries to average.
- The line under the verdict answers **"was that better?"**: `First run — this is the baseline` on the
  first run, then `vs last run: …`. Measured with two identical runs, the line read
  `vs last run: same parries`; the comparison reports the parry delta, and falls back to the median
  error when the parry counts match.
- From the second run on, `Last runs (newest first)` lists each run and a
  `2-run median: parried n, Nms` line follows it.
- History lives **inside the round only** — a reload starts from `First run`. Nothing is written to
  `localStorage`.

A run with no input ends at **wave 7/20** with `Parried: 0/20`: the enemies come to you, so standing
still is not a win.

## The `window.__parryState` hook

The HUD is painted into the canvas, so anything asserting from outside the page would have to guess at
pixels. The demo mirrors the run into `window.__parryState`, refreshed every frame:

| Field | Meaning |
| --- | --- |
| `phase` | `"title"`, `"play"` or `"result"` |
| `parried`, `lives`, `wave` | the same numbers the HUD shows |
| `contactMs` | ms until the next enemy reaches you, `null` when nothing is closing in (this is what `Contact in` prints) |
| `windowMs` | the live parry window in ms (what `Parry window` prints) |

End-to-end runs read this object instead of the canvas; the drawing the player sees is unchanged.

## The wave script

Difficulty lives in one place, `src/waves.ts`. Each row is the *shape* of an enemy (angle, speed,
radius); the spawn time is **derived** from when it should reach the player:

```
contact = at + (radius - CONTACT_DISTANCE) / speed
```

`CONTACT_DISTANCE` is 26 px (a 28 px player box and a 24 px enemy box touch at 26 px between centres)
and `CONTACT_SPACING` is 0.9 s, so no two enemies arrive closer together than you can read one and
answer the next. The first enemy is the onboarding one: 1.8 s, 55 px/s, radius 340. There is no RNG —
a given page load always plays the same 20 rows.

## Packages used

| Package | Role |
|---------|------|
| `@fogrexon/glyph-arena-collide` | **the backbone** - the forward parry box is an AABB tested against each enemy |
| `@fogrexon/glyph-arena-ecs` | one entity per enemy plus the player, with `aabb` and `velocity` components |
| `@fogrexon/glyph-arena-camera` | follows the player; offset by the shake so a parry is felt |
| `@fogrexon/glyph-arena-tween` | the camera punch after a parry |
| `@fogrexon/glyph-arena-timer` | ticked every frame so scheduled effects follow game time |
| `@fogrexon/glyph-arena-audio` / `assets` | the parry sound (decoded once, played on each parry); the game still plays with sound muted |
| `@fogrexon/glyph-arena-input` / `actions` / `gamepad` | arrows or stick to move, Shift/Space to dash |
| `@fogrexon/glyph-arena-loop` | the frame loop (delta clamped to 0.1 s) |
| `@fogrexon/glyph-arena-draw` / `scene` / `transform` | sprite drawing over a scene hierarchy with per-node transforms |

## Deliberately not used

There is no scrolling world, so the camera's `rotation` is not exercised; the scene hierarchy is used
for the field only. That is the one camera/scene feature this sample leaves alone.

## Run locally

```bash
pnpm install && pnpm -r build
pnpm --filter @fogrexon/glyph-arena-parry-demo dev
```

Published at <https://fogrexon.github.io/glyph-arena/parry/> (`PARRY_BASE=/glyph-arena/parry/` on build).
