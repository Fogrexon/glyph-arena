# Changelog

All notable changes to this project will be documented in this file.

Release tags are cut only when the shipped demo bundle (`index-*.js`) changes. Documentation-only changes (`docs/`, `README.md`) update the published site without a new tag.

## [Unreleased]

### Added

- Pickup demo at `examples/pickup-demo` now ships `favicon.ico` and `favicon.svg` linked from `index.html`, removing the `/favicon.ico` 404 on the public URL (demo-only; no package API change)
- `docs/*.md` are now published as static HTML on GitHub Pages under `/docs/` (index plus 14 API pages, each with a 14-item sidebar and H2 outline; rendered at build time by `scripts/render-docs.mjs`, and unsupported Markdown fails the build with `file:line`) (demo-only; no package API change)
- `@fogrexon/glyph-arena` 0.1.2 — new single-package distribution: the 14 modules are bundled into one
  ESM build with self-contained type declarations and `sideEffects: false` (flat re-export; ESM only,
  like the modules; the 14 modules stay workspace-internal and are not published). Demo bundle
  unchanged: the demo imports the modules directly, so `index-*.js` is not affected.
- `docs/index.html` on GitHub Pages now renders the repository `README.md` as the docs front page, with the 14 API pages kept as a list underneath; `README.md` itself is unchanged and edits to it now trigger the Pages deploy (demo-only; no package API change)

### Added

- Pickup demo is playable on touch devices: a tap starts the round (it feeds `Space` through the existing `start` binding) and an on-screen d-pad in the bottom-left corner drives the arrow codes. The touch UI is only drawn when `navigator.maxTouchPoints > 0`, so desktop rendering and input are unchanged (demo-only; no package API change; `index-*.js` changes)

### Changed

- Pickup demo hazards now patrol lanes that cross the floor instead of running three short edge lanes: H0 sweeps the spawn row, H1 runs the spawn column, H2 sweeps the bottom gem row (all still 80 px/s, fixed spawns, no RNG). Standing still now costs a life, so a round involves dodging rather than a safe 26-second errand (demo-only; no package API change; `index-*.js` changes)
- Pickup demo hazards hold still for the first 3 s of every round (HUD shows `READY`) and move only after that, so a first-time player can read the controls before the first hit; `R` re-arms the same 3 s window (demo-only; no package API change; `index-*.js` changes)

### Added

- Pickup demo shows the round's clear time and the fastest clear since the page was loaded on the result screen (`Clear: X.Xs`, `Best: X.Xs`, and `CLEAR — NEW BEST` when it beats the previous one). Round-scoped on purpose: nothing is written to storage (demo-only; no package API change; `index-*.js` changes)

### Added

- Pickup demo cycles through **three fixed layouts** (gems and hazard lanes) by restart count, so a second round is not the first one memorised. No RNG: the sequence is fixed and `layout = restarts % 3` (demo-only; no package API change; `index-*.js` changes)

### Fixed

- Pickup demo no longer ends a round when the tab was in the background: the frame delta is clamped to `0.1 s` before it reaches movement, hazards and the round clock (the missing cap in `@fogrexon/glyph-arena-loop` is tracked separately) (demo-only; `index-*.js` changes)

### Added

- `examples/pickup-demo/e2e/clear-run.json` - a verified 8/8 CLEAR route (258 world-space waypoints) for the CI E2E to replay; measured CLEAR 25.1 s with 1 life left (test fixture only)

### Added

- Pickup demo now reacts to a hit: the player is knocked 44 px away from the hazard (halved or skipped when a wall is in the way) and blinks at 10 Hz for the 1 s of invulnerability, so damage reads as an event instead of only a counter change (demo-only; no package API change; `index-*.js` changes)

### Added

- Pickup demo's title now states the goal and the controls before the round starts: "Collect 8 gems in 60s - 3 lives" plus the arrow/Shift/R keys (or the touch wording on touch devices) (demo-only; no package API change; `index-*.js` changes)

### Added

- `examples/parry` - a second sample game (dash into an incoming enemy to parry it; the waves are a fixed script, so no RNG). Published beside the frozen pickup demo at `/glyph-arena/parry/`, while the pickup demo keeps `/glyph-arena/`. `collide` is the backbone (the parry box is an AABB), with `ecs` enemies, `camera` shake, `tween` punch and `input`/`actions`/`gamepad` control (demo-only; no package API change)

### Added

- `examples/parry`: the result screen now puts the run-to-run comparison on one line under the verdict (`vs last run: +1 parry, median error -80ms`, and `First run — this is the baseline` on the first run), coloured when the run was an improvement, so "was that better?" is answered without reading the history list. Session-only, like the history it reads: nothing is written to storage (demo-only)

- `examples/parry` now keeps the **last 5 runs** on the result screen (parried count, median absolute ms error, reached wave, plus a run median) so a session can be judged from numbers. The history lives in memory only: nothing is written to storage and a reload starts fresh (demo-only)

### Fixed

- `examples/parry`: the title subtitle wraps instead of being clipped at 390 px, `Median error` shows an em dash when a run parried nothing (the field no longer disappears), and the demo ships its own `favicon.svg` so the console stays clean (demo-only)

### Added

- `examples/parry`: the HUD now shows **`Contact in 1234ms`** - the time until the nearest approaching enemy touches the player, turning amber once that is inside the parry window. The window was already printed in ms while the thing you aim at was not, so a player (and every E2E) had to derive the moment from the wave table. `Contact in -` means nothing is closing in yet. The onboarding hint moves down one line to make room (demo-only)

### Fixed

- `examples/parry`: the `DASH` button now shows that it took the press (a held button is filled and outlined harder while a finger is on it), and pointer positions are converted into canvas pixels before hit-testing. The bitmap is `innerWidth x innerHeight` while the CSS box is whatever the layout gives it, so on a phone a position compared straight against a canvas coordinate lands beside the button - the reason a correct tap could miss (demo-only)

- `examples/parry`: the result screen no longer draws the field. The enemies and the player used to sit frozen behind the verdict, at positions that stopped meaning anything the moment the last life went - the screen now shows the result, the comparison line and the run history on an empty background (demo-only)

- `examples/parry`: **touch can now dash**, so a parry is reachable on a phone. The pad could move and the result screen could restart, but dashing was bound to `Shift`/`Space` only - the one verb the game is about. A `DASH` button now sits bottom-right and injects `Shift` at the same point the keys come from, the pad and the button track their own pointer so a thumb on each works, and the hint reads `Dash into it - tap DASH` on touch (`Shift or Space` with a keyboard) (demo-only)

- `examples/parry`: a touch-only player is no longer stuck on the result screen. A fresh tap restarts the round through the same path as `R` (the hint reads `Tap to retry` on a touch device and `R restart` with a keyboard), and the d-pad is no longer drawn once the round is over, where touching it did nothing (demo-only)

- `examples/parry`: the parry window now sits **outside the contact radius**, so a parry is possible at all. It used to be 200 ms of time-to-contact, which at wave 1 is a 14 px gap while the player and enemy boxes touch at 26 px - the enemy hit you before the parry could register. It is now 550 ms (38 px) narrowing to 200 ms (31 px) by the last wave, and the forward box grows 46 -> 56 px (demo-only)

### Changed

- `examples/parry`: the wave table is now written as **target contact times** with the spawn time derived (`at = contact - (radius - 26) / speed`), so contacts stay in order and at least 0.9 s apart by construction rather than by inspection; `test/waves.test.ts` asserts the properties a run depends on (20 waves, the onboarding enemy untouched at 1.8 s / 55 px/s, contacts and spawn times both ascending and never closer than 0.9 s) and runs with `pnpm -r test` (demo-only)

- `examples/parry`: the **second** enemy now waits until 5.0 s (was 3.0 s). It used to reach the player 0.33 s *before* the first enemy the HUD is teaching you to parry, so the tutorial punished the read it had just taught. Measured on the shipped build across three wave settings, the first parry landed without losing a life in 3 of 3 presses with the new timing against 1 of 2 with the old one (demo-only)

- `examples/parry`: the first enemy is slower and later (55 px/s from 1.8 s) and the HUD shows "Dash into it" until the first parry lands, so a first run has a moment to learn the one verb before the pressure starts (demo-only)

- Pickup demo hazard lanes now run straight over gems the player has to reach (H1 over the north gem's column, H2 beside the east gem) instead of patrolling empty floor, so the danger is spatial rather than a timing coincidence; the central wall block moves 40 px east so the spawn no longer opens 6 px from a wall (demo-only; no package API change; `index-*.js` changes)

### Fixed

- `@fogrexon/glyph-arena-timer` — `dispose()` now stops firing immediately: callbacks that were already due in the same tick are no longer invoked after it (behaviour change, no API signature change)

## [0.1.0] - 2026-11-15

### Added

- `@fogrexon/glyph-arena-actions` 0.1.0 — action bindings from keyboard codes (`createActions`)
- `@fogrexon/glyph-arena-assets` 0.1.0 — URL asset loading with cache (`createAssets`)
- `@fogrexon/glyph-arena-audio` 0.1.0 — Web Audio playback helper (`createAudio`)
- `@fogrexon/glyph-arena-camera` 0.1.0 — 2D camera state and world-to-screen view matrix (`createCamera`)
- `@fogrexon/glyph-arena-collide` 0.1.0 — AABB overlap test (`overlaps`)
- `@fogrexon/glyph-arena-draw` 0.1.0 — minimal 2D canvas drawing (`createDraw`)
- `@fogrexon/glyph-arena-ecs` 0.1.0 — entity-component storage (`createWorld`)
- `@fogrexon/glyph-arena-gamepad` 0.1.0 — gamepad state snapshot (`createGamepad`)
- `@fogrexon/glyph-arena-scene` 0.1.0 — hierarchical scene graph nodes (`createForest`)
- `@fogrexon/glyph-arena-loop` 0.1.0 — injectable frame loop (`createLoop`)
- `@fogrexon/glyph-arena-input` 0.1.0 — keyboard and pointer input snapshot (`createInput`)
- `@fogrexon/glyph-arena-timer` 0.1.0 — tick-driven timer scheduling (`createTimer`)
- `@fogrexon/glyph-arena-tween` 0.1.0 — tick-driven scalar tweening (`createTween`)
- `@fogrexon/glyph-arena-transform` 0.1.0 — per-node local 2D transforms and world matrix composition (`createTransform`)
- API reference for `@fogrexon/glyph-arena-camera` (`docs/api-camera.md`)
- GitHub Pages demo is now the pickup sample at `examples/pickup-demo`
- Pickup demo at `examples/pickup-demo` now also uses assets, audio, gamepad, and ECS (demo-only; no package API change)
- Pickup demo at `examples/pickup-demo` now uses scene parent/child hierarchy (field parent, gem reparent + tween scale-out; demo-only; no package API change)
- Pickup demo at `examples/pickup-demo` now has KeyR restart via `actions.pressed("restart")` and `timer.every` idle gem pulse (demo-only; no package API change)
- Pickup demo at `examples/pickup-demo` now has KeyP pause via `actions.pressed("pause")` and `audio.stop` on enter-pause (demo-only; no package API change)
- Pickup demo at `examples/pickup-demo` now has keyboard camera zoom via demo-local `baseZoom` (`=`/`+` in, `-` out, `0` reset; clamped 0.5–2, step 0.1; Restart wins over Pause/zoom same frame; demo-only; no package API change)
- Pickup demo at `examples/pickup-demo` now faces move direction via demo `transform.rotation` (`atan2(dx, -dy)` from keyboard/gamepad input; AABB stays axis-aligned; Restart resets facing up; demo-only; no package API change)
- Pickup demo at `examples/pickup-demo` now has a brief camera punch on gem pickup via demo-local offset + `tween.to` (distance 8, 0.12s linear, opposite player→gem; coexists with pickup zoom; demo-only; no package API change)
- Pickup demo at `examples/pickup-demo` now has keyboard camera rotation via demo-local `baseRotation` (`Q` CCW / `E` CW / `T` reset; clamped ±π/4, step π/36; Restart wins over Pause/zoom/rotate same frame; pause applies rotation-only partial `camera.set`; demo-only; no package API change)
- Pickup demo at `examples/pickup-demo` now scale-ins new/respawned gems via `tween.to(0, 1, 0.2)` (scale 0 set before tween; idle pulse after complete; cancel on pickup/Restart; demo-only; no package API change)
- Pickup demo at `examples/pickup-demo` now routes movement through named actions (`moveLeft` / `moveRight` / `moveUp` / `moveDown`); each frame copies keyboard keys and injects pad-0 arrow codes before `actions.tick` (demo-only; no package API change)
- Pickup demo at `examples/pickup-demo` is now a one-round CLEAR (`GEM_TOTAL` gems, no respawn; clear on full collect; R restarts; demo-only; no package API change)
- Pickup demo at `examples/pickup-demo` now has a 60s round timer via `timer.delay` (FAIL on timeout; CLEAR cancels the delay and wins same frame; R restarts; demo-only; no package API change)
- Pickup demo at `examples/pickup-demo` now has title → play → CLEAR/FAIL result phases via scene subtree swap under `screenRoot` (Space/Enter start; R rematches play, not title; demo-only; no package API change)
- Pickup demo at `examples/pickup-demo` now has static red hazard tiles on the field (`overlaps` AABB contact → instant FAIL, same path as timeout; same-frame CLEAR wins; demo-only; no package API change)
- Pickup demo at `examples/pickup-demo` now has 3 lives with hazard contact −1 and 1.0s invulnerability gated on demo `scheduleSeconds` (0 lives → FAIL same as timeout; same-frame CLEAR wins; R resets lives; demo-only; no package API change)
- Pickup demo at `examples/pickup-demo` now has 3 red hazards that cruise at 80 px/s with wall AABB bounce (axis-aligned velocities H0=(+80,0)/H1=(0,+80)/H2=(0,-80); pass through player/gems/each other; lives/i-frames unchanged; demo-only; no package API change)
- Pickup demo at `examples/pickup-demo` now shows frozen remaining round time on the result screen (Score → Lives → Time `x.x` → CLEAR/FAIL; no extra freeze state; demo-only; no package API change)
- Pickup demo at `examples/pickup-demo` now has a ShiftLeft dash burst (0.15s at 360 via demo `dashUntil` on `scheduleSeconds`; re-press ignored during burst; no i-frames; demo-only; no package API change)
