# Changelog

All notable changes to this project will be documented in this file.

Release tags are cut only when the shipped demo bundle (`index-*.js`) changes. Documentation-only changes (`docs/`, `README.md`) update the published site without a new tag. The tag is also the npm version: `@fogrexon/glyph-arena` is published at the version the tag names (`pnpm publish:npm --publish`), so the two are always the same number.

## [Unreleased]

### Fixed

- **MARCH's death screen said `hits 4 (4 from behind)`, and nothing measured a side.** The number
  behind the label was `player.vx > 60` — *were you running at the goal when it landed* — so two
  first-time players (11-19) reported "4 hits, all from behind" as the cause of death on runs that
  had `passed 0/11`, where every guard is still in front of them. The person who wrote the label
  read it the same way, twice, while tuning against it. `hits[].cause` is now `"running" |
  "standing"`, the HUD prints `hits 4 (4 while running)`, `scripts/play-bot.mjs` prints the same
  wording, and `examples/march/test/readout.test.ts` fails if a label names a side again. Same rule
  as the `kicks` correction: **the instrument may not name a thing it did not measure.**

- **The `march mixed` stall was the harness losing a key, not a guard blocking the road.** A run
  froze at `x 2526` for two minutes on 11-19 and the first reading was a body pushed into a guard who
  never committed. The captured state says no: `vx 0`, four hearts, and no living guard within
  400 px — every one of the eleven dead or passed. The game derives `vx` from the keys it received
  that frame, so a standing body on a clear road means no key, and the harness's held set never
  re-sent it. `scripts/play-bot.mjs` now re-sends the key when the road is clear and the body is not
  moving, and prints `kicks`; a non-zero count on a passing run is the evidence if it returns. The
  note in `examples/march/README.md` is corrected to say so, because the page had already recorded
  the wrong reading as the open question.

### Changed

- **march draws its road at world coordinates too — and a transform rasterises a stroke one pixel
  differently from pre-subtracted numbers.** The third sample to hand its camera to
  `draw.setView`: `paint.setView({ scale: 1, offsetX: -fromX, offsetY: 0 })` replaces `- fromX` at
  every drawing call, and the HUD goes back to `setView(null)`. `fromX` survives only for the two
  questions that are *about* the screen (the tile window and the goal's cull).
  **`round: true` is not usable here**: it rounds the *offset*, which is negative, and
  `Math.round(0.5)` is 1 while `Math.round(-0.5)` is -0 — a camera that lands exactly on a half
  pixel would move the picture one pixel. The rounding therefore stays on the camera and the
  projection is handed the already-rounded offset. (No frame of this scene ties, so the two forms
  measured identically here; the line is about the frames that do.)
  Measured on one build pair (640x360 canvas, same input, frames 60/120/180): **frames 60 and 120 are
  0 px**; **frame 180 differs by 24 px in a 4x6 box (maxΔ 244)** at the corner of a 2 px `strokeRect`
  outline (a woken guard's mark), with `__marchState` identical. That is rasterisation, not geometry:
  a canvas transform stores its matrix in float32, so a stroke edge can land on the other side of a
  pixel from the same arithmetic done in plain doubles. Nothing else moved, and no scale, rotation or
  culling changed.

- **MARCH says what the roll does, because three first-time players never found it.** All three
  finished their minute at `passed 0/11`: `A/D run · Space jump · J attack · Shift roll` reads as two
  ways to hit things, so nobody learned that a roll is the only thing that crosses a body, and the
  cost system was dead code for every player. The controls line is now two rows, the second being
  `Shift rolls through a body — the guard you pass wakes the next one`.

- **MARCH marks a woken guard on the screen edge when his body is off screen.** QA went over the
  first guard deliberately: the pair woke on cue at 774 and 870 while the player stood at `x 406`,
  which on the 640 px view with the camera at 42% is 637 px and 733 px — the last column of pixels,
  and past it. A cue off screen is absent, not quiet. An alerted guard whose body is outside the
  view now draws a 4 px cream bar on the edge he is off of (`edgeMarkFor` in `src/readout.ts`); a
  visible body keeps its own mark, so one guard never reads as two.


- **pickup's camera goes through `draw.setView`, not through six numbers.** Its four world drawers
  each composed the camera matrix with the node's world matrix and then called
  `ctx.setTransform(a, b, c, d, e, f)` — the tuple existed only to feed that call. `multiplyMatrices`
  already returns a `Matrix2D`, which is what `setView` takes, so the tuple, `matrixToArgs` and
  `composeViewAndWorld` are gone, and the four screen-space resets are `setView(null)`.
  Measured on one build pair (900x540, same input, frames 60/120/180, a frame-pumped harness that waits
  for the title's `ready` handshake): **0 px differ on all three frames**, the same three hashes, and
  `__pickupState` identical. This migration changes which function writes the transform, not the
  numbers. **Nothing was missing from `draw`** for it — pickup already drew its sprites through `draw`,
  and `setView` accepted the camera's matrix as it was.

- **MARCH: the called guard announces himself for 600 ms before the quiet mark.** A price nobody
  reads is not a price: a 2 x 7 px bar above a 20 x 44 px body is only visible to someone who
  already knows to look, so a guard woken by the one you passed now wears a wide mark and a halo for
  `ENEMY_AI.alertFlashMs` (600), then the quiet bar for the rest of the alert. Both ends are
  derivable and gated: longer than a simple reaction to a shape change (> 250 ms), shorter than the
  640 ms it takes to walk a beat (6 tiles at 300 px/s), so the cue belongs to the guard who shouted
  rather than to the road (`test/enemy.test.ts`). Drawing only: nothing in the step changes.
  The regression run found something else, in the hand rather than in the picture — see the entry
  below — and it is filed rather than fixed here, because it is a different question.


- **MARCH: the guard you walk past shouts ahead — going by finally costs something.** A passed guard
  wakes the next post (and that guard's partner, if he has one): the called guard commits from
  `ENEMY_AI.alertRangePx` (190) instead of `lungeRangePx` (70), so his 138 px lunge lands **52 px
  short of where you stood** and across the road you are running down — you arrive at his body with
  the roll still cooling. With the pursuit alone the **mixed** line (roll the singles, fight the
  pairs) cleared in **41.0–51.9 s with no hits**, faster *and* safer than fighting everything
  (65–73 s), so the road still had one best line. With the shout the same hand clears in
  **34.1–47.1 s taking 1–2 hearts**, while careful stays **68.1–72.6 s untouched**: half the time for
  a heart, which is the choice the road was built to ask. The pure roll lines get worse as they
  should — `rush` down at 8/11 → **7/11** (6.58–6.62 s), `bold` down at 9/11 and slower
  (**8.70–8.73 s**) — and `run` is unchanged at 4.58–4.62 s because it never passes anybody, which is
  the control this needed. The called guard is drawn with a mark above his head: a price has to be
  visible before it is paid. `calledBy` is pure and in posts, so the rule is read by the test without
  a fight (`test/enemy.test.ts`: passing 448 wakes the 768/864 pair and nothing else; 190 is further
  than the commit reaches and closer than the distance a guard normally holds).

### Added

- **The pixel gate photographs pickup too, and it now waits for a page that loads before it starts.**
  `pickup-1` runs three seconds of right + up at 900x540 and samples frames 60/120/180; the camera
  follows the player, which is what a projection change moves. The scene needed the one thing the
  runner did not: a `ready` predicate. Images decode on the event loop the harness has otherwise
  taken over, so pumping 600 frames in one go reaches frame 600 with the atlas half loaded and the
  title still up — pressing start into that screen photographs nothing. A scene that declares
  `ready` is advanced **one frame at a time, with a real pause**, until the page says it is ready,
  and its frame numbers are then counted from that frame.
  Reverse check in a Pod: shifting pickup's camera by 0.4 px turns **`pickup-1` red on all three
  frames** and leaves both runner scenes green — the scene steps on pickup's projection and on
  nothing else. Restored, all three scenes pass.

- **The pixel gate now paints a scale that is not 1.** `runner-scale` runs the same 180 frames, the
  same level and the same input column as `runner-1`, at 900×700 instead of 900×540 — `700 / 540 =
  1.296…`, so the world lands on fractional device pixels. The single scene was blind exactly where
  the next migration lives: at 900×540 the runner's own `LOGICAL_HEIGHT` makes `scale()` **1**, and
  `(column * TILE - cameraX) * s` and a canvas transform of `s` differ by a multiplication by one, so
  moving the runner onto `draw.setView` could have been green while the code path that scales was
  never drawn. Reverse check in a Debian chromium 156 Pod, with `scale()` mutated to
  `Math.round(canvas.height / LOGICAL_HEIGHT)`: **`runner-scale` 3 of 3 frames red**, and `runner-1`
  byte-identical — the three hashes it measured are the three in the golden (`37f3ca1d…`,
  `eb4de4b3…`, `004af59c…`), which also re-confirms that 156 and 157 render this scene the same.
  `pnpm e2e:pixel` now runs **every** scene by default, derived from `SCENES` rather than listed in
  the workflow, so a scene added later is covered the day it is declared; `--scene` still narrows to
  one for a red that names a single cause.

- **MARCH: the mixed hand — roll the singles, fight the pairs — and the post it needs to say which is
  which.** `scripts/play-bot.mjs march mixed` spends the roll on a guard who is alone and fights one
  who is not; the pair test reads **posts**, because a guard mid-lunge is 138 px from his post and a
  version that measured bodies turned every pair into two singles for the length of the tell (it
  rolled past the first pair and stalled at x 709 for the full two minutes — measured, then fixed).
  So `homeX` is published with the rest of the state: the post is the thing a plan is made against.
  Measured on the same build, three runs: **clear 11/11, 41.0–51.9 s, 0 hits**, five guards passed
  and six killed, 10 rolls and 32 swings a run. That is **faster and untouched** next to the careful
  65–73 s, so the road still has one best line rather than two: going by costs nothing, and the
  pursuit's single commit is answered by the roll the crossing already spends. The pair threshold is
  gated against the level's own spacing (`scripts/play-bot.test.mjs`: the widest in-beat gap must be
  under `PAIR_PX` and the narrowest beat break over it), reverse-tested by moving it to 90.

- **MARCH: two more hands in the harness, because "can you clear by running" was two questions.**
  `scripts/play-bot.mjs march` now takes `run` (never swings, never rolls) and `rush` (walks, spends
  the roll on every cooldown), next to `careful` and `bold`. They split what one probe had been asked
  to answer at once: does walking pass a body at all, and is the roll enough when it is always
  available. Measured on the same build (`index-BO-GvoxH.js`), three runs each: `run` **down at 0/11,
  4.60–4.62 s**, `rush` **down at 8/11, 7.28–7.31 s**, `bold` **down at 9/11, 7.76–7.83 s**. So
  **"clear by running" is not expensive, it is unavailable**: a body is a wall and the roll is the
  only way through it, and the pairs' 96 px spacing against the roll's 73 px of travel kills both roll
  timings in the same four places. The 15.0 s clear by running does not reproduce with either hand.
  `run`'s property is gated — `scripts/play-bot.test.mjs` turns a `press(` inside that hand red, so a
  later "it does not clear, let it roll" edit cannot quietly turn the measurement back into `bold` —
  and the pass-line range rule derives its rows from the page instead of naming two
  (`scripts/march-readme.test.mjs`).

- **`scripts/pixel-hash.mjs`: the first gate that reads the picture.** Every browser gate here reads
  `window.__runnerState` or a DOM property, so a change that keeps every number and moves 172 pixels
  is invisible to all of them — measured on the first attempt at moving a game onto
  `draw.setView({ round: true })`, which matched on all nine checkpoints while the canvas moved.
  The gate takes time away from the page (`requestAnimationFrame`, `performance.now`, `Date.now`,
  `Math.random`, `devicePixelRatio`), applies input at **frame numbers**, and hashes the canvas'
  RGBA bytes — never a PNG — at three frames of a 180-frame runner scene. It runs the scene three
  times first and requires the three hashes to agree, so a scene that reads the wall clock fails
  before it is compared with anything. The golden carries the environment it was written in: a
  differing Chromium major, platform, viewport or font probe **refuses to compare** and names the
  difference, instead of producing a red that means "the browser changed". `--write` is the only
  way to change a golden, so a picture change is a diff in the pull request. Reverse-tested:
  shifting the tiles by 0.4 px turns all three frames red, reverting returns them green, and a
  normal run leaves the golden file untouched.

### Changed

- **The runner draws its world at world coordinates; the projection is the library's.** It imports
  `@fogrexon/glyph-arena-draw` and draws the level, the walkers and the player at `column * TILE`, not
  at `(column * TILE - cameraX) * s` — `paint.setView({ scale, offsetX: -cameraX * s, offsetY })`
  owns the map from world to screen, and the sky, the parallax and the HUD go back to
  `setView(null)`. `offsetY` lives in the projection and nowhere else (the first attempt at this,
  on 2026-11-19, added it to the coordinates as well and moved 129,214 pixels instead of none).
  The one screen pixel of overlap between tiles became `1 / scale` world units, so the seam it
  exists for stays one pixel wide at every scale. Measured with `e2e:pixel`: **`runner-1` (s = 1) is
  identical on all three frames**, and `runner-scale` (s = 1.296…) differs on **one** of them —
  frame 120, **83 pixels in a single column (x = 21, y 537–619), maxΔ 2/255**. That is not geometry:
  `(x - cameraX) * s` and `x * s + (-cameraX * s)` round differently in the last bits, so one tile
  edge's antialiasing falls on the other side. The golden was rewritten for that frame with
  `--write`; the diff is reviewable, and the other two frames prove nothing else moved.

- **MARCH: a guard you walked past turns and follows — passing is a loan, not a free pass.** With the
  guard holding his post the road behind you was empty, so the fast line was faster *and* safer:
  measured on 11-19 by three players, 15.0 s to clear by running against 28.5 s by fighting, which is
  not a choice. A passed guard now follows at `ENEMY_AI.chaseSpeedPxPerSecond` (330) — 30 px/s faster
  than `PLAYER_RUN_PX_PER_SECOND` (300) — while you are inside his sight, **gets exactly one commit**,
  and then walks home spent. So a guard can cost at most one heart in a run, and eleven guards cannot
  become eleven hits. He is drawn with an outline while he is coming, because a thing that follows you
  has to be visible as one, and `spent` is published with the rest of the state.
  Measured on the same build, three runs each: careful **clear 11/11, 66.4–72.8 s, 0 hits** (the fight
  line is untouched — a guard you kill never follows), bold **down at 9/11, 7.76–7.81 s, 4 hits** at
  the same four places, and a run-and-roll probe that passed nine guards had **eight of them chase and
  commit at its back** (`spent: 8`) — answered with rolls, which is what the roll budget is for.
  **The pass line is still not proven, and the blocker is not the pursuit**: every run line this
  repository can measure dies at the **pairs** first (9/11, 7.4–7.8 s) before the pursuit has time to
  cost a heart. The reported 15.0 s clear by running does not reproduce with `bold` or with that
  probe, so the fast line needs a strategy of its own in `scripts/play-bot.mjs` before "clear by
  running, but not untouched" can be checked. That is the next measurement, not this change.

### Fixed

- **MARCH: the blade now reaches the line the guard commits from, and a swing that hits nothing is
  drawn.** `ATTACK.reachPx` was 30 px past the body while a guard starts his tell at
  `ENEMY_AI.lungeRangePx` — 70 px centre to centre, a **50 px gap** — so "the tell is your window:
  strike it early, which cancels the lunge" was a move the game asked for and did not allow. The only
  way to hit a tell was to walk inside the lunge first, which is the thing the tell exists to let you
  avoid. A first-time player found it on 11-19: three swings at range with `blade: active` on screen,
  the guard's hp untouched; two hits at a 20 px gap. **A rule nobody can see is not a lost fight** —
  the reach is now 52, which clears the 50 px line with 2 px to spare, and `test/combat.test.ts`
  derives the 50 from the two body widths and the lunge range, so moving the trigger re-opens the
  question instead of quietly reinstating it. The same test keeps the other end honest: one pixel past
  the reach is still a miss, because a reach without an end turns the fight into "press J from
  anywhere". A swing that lands nothing now leaves its box on screen, grey and fading for 130 ms — a
  miss used to look exactly like a dropped keypress, which is what the player had to learn from — and
  `whiff` is published with the rest of the state so a harness can tell the two apart.
  Re-measured, same build, three runs each: careful **clear 11/11, 66.3–74.4 s, 0 hits** (was
  61.8–66.5 s), bold **down at 9/11, 7.80–7.86 s, 4 hits at the same four places**. `hp` and `hearts`
  are untouched, as agreed: those wait for a person's end of a run.

## [0.6.0] - 2026-11-19

The version that moves `draw.setView` from a matrix to a projection — `{ scale, offsetX, offsetY,
round? }`, the three numbers a scrolling game already has — and draws camp through it with a
picture that did not move by a pixel, measured 9 checkpoints at a time rather than asserted. It is
a minor and not a patch because `Projection` is a new exported type and `draw.setView` a new
accepted shape; `draw.rect` also draws through `fillRect`/`strokeRect` when no radius is asked
for, which is faster and lands the same pixels. Everything else in it is `reset` reaching its
fourth, fifth and sixth user, and the holes that turned up on the way.

### Added

- **`draw.setView` takes a projection — the three numbers a scrolling game already has — and camp
  is drawn through it with a picture that did not move by a pixel.** `Projection` is `{ scale,
  offsetX, offsetY, round? }`, applied as `[scale, 0, 0, scale, offsetX, offsetY]`; a
  `camera.view()` matrix is still accepted and `null` still returns to screen coordinates. The
  reason is counted, not guessed: camp, march and runner each wrote the same two lines by hand
  (`Math.round(cameraX + shake)`, then subtract it from every x) and none of them called
  `setView` — remembering a matrix only to hand it back cost as much as the arithmetic did.
  - `round` rounds the **offset**, once, and never a point. Rounding points turns the 0.2px gap
    between two tiles into 0 or 1, which is a one-pixel seam at every join of a tiled wall.
  - **`rect` without a radius is `fillRect` / `strokeRect`, not a path.** Measured in Chromium: on a
    fractional coordinate a path fill differs from `fillRect` by 2 pixels and a path stroke from
    `strokeRect` by 12. The first version of this change drew every rectangle as a path and camp's
    frame moved 172 pixels by 1/255; with the native call it is **0 differing pixels across nine
    checkpoints** (boot, idle, walk, jump, attack, engage, dodge, push, death) against the previous
    build at the same simulated frames, with the simulation state identical at every one.

### Changed

- **`reset` reaches its fourth, fifth and sixth user — and the three holes it found were all the
  same shape: two ways into a run, one of them written later.** `@fogrexon/glyph-arena-reset` was in
  camp and march; it is now in parry, pickup and runner too, which takes it from "the slice CAMP
  happens to use" to the thing every game reaches for. The point of the package is not the lines it
  saves, it is that a run has **one** reset and every entry point calls it — and each of these three
  had hand-written that reset twice.
  - **runner**: the title screen zeroed the run clock by hand and the goal screen — "run it again" —
    did not. A second run started at the previous run's `simSeconds`, so every jump in it was
    measured against a clock that had already run out. One registration now owns the clock, and both
    ways into a run call `reset.run()`.
  - **pickup**: `beginPlayFromTitle` and `restart` each wrote their own list of the same
    assignments, and the lists had already drifted: only the title path cleared `paused`, and only
    the restart path cancelled a punch tween in flight (a kick from the last round carried into the
    next one's first frame). The zoom handles had the same split. One registration covers both
    paths, with `armRoundTimer` as the last entry because it is the round's own start.
  - **parry**: the hand-written body had dropped two fields. `wrapCount` is published to the
    harness, so a new run reported the last run's wraps; and the punch's tween was never cancelled,
    so a kick still in flight when the run ended bled into the next run.
  Each slice has a gate that walks its own `let`s and fails on a field that is neither put back nor
  named in a KEPT list with a reason (`scripts/{parry,pickup,runner}-reset.test.mjs`), plus the
  "both entry points call the same reset" check, which is the actual lesson. Reverse-tested: dropping
  `wrapCount` from parry's registrations names it; putting `score = 0` back into pickup's
  `restart()` fails with the field's name; zeroing `simSeconds` by hand again in runner reports
  "zeroed 2 time(s) by hand".

- **`scripts/reset-audit.mjs`: one scanner for the four reset gates — and the scanner has its own
  gate.** march, parry, pickup and runner each keep a `*-reset.test.mjs`, and all four were the same
  scan with a different KEPT list: four chances to write a slightly different scanner. The scan now
  lives in one module, so a seventh slice's gate is its KEPT list, two one-line tests, and whatever
  is that game's own business. The module's own tests are the point of the unit: a scanner that says
  "nothing missing" for every input turns all four gates green forever and looks identical in the
  logs, so it is fed fixtures that must be red — `x === 1` in the registrations is a comparison, not
  a reset; a `let` a slice forgot is named; a KEPT entry that is also assigned fails; and a slice
  that stopped calling `createReset()` fails loudly instead of reading as clean. Reverse-tested
  against the four real slices: dropping parry's `wrapCount`, putting `score = 0` back into pickup's
  `restart()`, deleting march's `dodge` registration (`the reset does not put back: dodge` — the
  original CAMP bug, now caught by a gate instead of by hand) and zeroing runner's clock by hand all
  go red.

### Fixed

- **MARCH: a guard's post no longer walks down the road.** The lunge carries the body 138 px and
  nothing carried it back, so every commit left the guard that much closer to the spawn wall.
  Measured by holding right at the first guard — no attack, no roll — the post went 454 → 329 → 204 →
  79, the body was pushed 434 → 309 → 184 → 59, and the run ended at the wall in 4.2 s having decided
  nothing: the road under the fight was being rewritten by the guard the player was trying to get
  past. It is CAMP's "the enemy walks you into the wall", one layer down — that fix stopped the walk,
  this one makes the step he *does* take come back. A guard now returns to the post he committed
  from at `ENEMY_AI.returnPxPerSecond` (300 — the player's own speed, so the walk home cannot be
  chased down) and will not begin a tell until he is standing on it.
  Measured after: careful **clear 11/11, 3 of 3 runs, 61.8–66.5 s, 0 hits** — the heart it used to
  lose at `x 34` is gone, and this is the first time that row is honest rather than the best of two
  runs. Bold unchanged: **down at 9/11, 7.77–7.81 s, 4 hits, all four while running at the goal, at
  the same four places**. The page's pass line is now three runs quoted as a range, and
  `scripts/march-readme.test.mjs` fails if it is written as one number again, while the new
  `scripts/march-post.test.mjs` fails if the walk stops reading `homeX` or a tell is allowed off-post.

## [0.5.0] - 2026-11-19

The version that adds a module — `@fogrexon/glyph-arena-reset` — so that a retry cannot inherit
the previous round. Adding exported names is a minor under 0.x, so this is `0.5.0` and not `0.4.1`;
the umbrella now re-exports 21 modules. It is also the release that ships MARCH, the second sample
and the first one that is not a room, and the README table of samples together with the gate that
reads it back against what the deploy publishes.

### Added

- **`@fogrexon/glyph-arena-reset` — one list of "put this back", run where it was written.** Every
  slice hand-wrote its own reset and every one had the same hole: a state field is added, and the
  line that resets it is added somewhere else — or not at all. Nothing throws; the previous round's
  value stays, and the second run reads as a game bug. **`examples/camp` had already lost one**:
  `dodge` was never reset, so dying mid-roll came back mid-roll and still invulnerable.
  `createReset()` returns `{ add(name, fn), run() }`: register next to the state, and boot and retry
  call the same `run()`, because two entry points into a round is how one of them goes stale. A
  duplicate name throws, a registration during `run()` throws, a re-entrant `run()` throws, and a
  failing entry stops the list and rethrows — a half-reset state that looks normal is worse than a
  crash, because the next frame reads it as a real round. `run()` is synchronous (a one-minute game
  cannot spend its retry on a scene change) and returns the count, which is deliberately **not** a
  gate: the number changes whenever a subsystem is added. Applied to camp: fifteen registrations
  replace the fifteen-line function, and `dodge` is reset again. Umbrella exports 20 → 21 modules.
  Tested by R1–R6 (order and count, idempotence, duplicate name, add during run, run during run, a
  failure stopping the rest and leaving the reset usable) plus R8 in a real browser: after a death
  and an `R`, `phase` / `hearts` / `hits` / `simMs` / `lastCommitMs` are all back to their first-frame
  values — and with the `commitClock` registration removed, `lastCommitMs` stays at the previous
  match's 6227 ms, which is the failure this package exists to make impossible.

- **MARCH: the second sample, and the first one that is not a room.** `examples/march` is eleven
  guards on a 92-column road — one minute, death, and a one-frame retry — played by
  `pnpm march:bot march bold|careful`. The question it exists to ask is *fight it or go by it*, and
  the answer is a measured split rather than a claim: `careful` clears **11/11 in 74.3 s with 0
  hits**, while `bold` rolls through everything and **dies at 9/11 in 8.3 s with 4 hits, every one
  of them logged as taken while running at the goal**. Rolling past the first of a pair lands the
  body inside the second guard's reach 96 px later with the window already spent — that is where
  the fast road ends, at the same four places on every run — so "go by everything" is not a plan.
  Four rules carry the game, each with the measurement that produced it: **a body is a wall**;
  **pushing into a body** costs a heart, while standing next to one is free (the first version
  damaged on any contact and the fight it produced was not a fight — a bot playing CAMP's proven
  waiting game lost four hearts before its first kill); **a roll crosses a body for its whole
  180 ms**, not just the 140 ms window (exempting the window alone had the last 40 ms shoved back
  out, so no roll ever finished a crossing); and **every beat is roofed** to 64 px, so a 28 px body
  can hop 36 px and never clear a 44 px guard — without the roof a 111 px jump clears any guard at
  any point, and going by would have been free. Six tests hold the level: both edge columns solid
  on every row, the road walkable from spawn to goal, every guard on ground, the goal past the last
  guard, the beats' grouping derived from the layout, and the roof-versus-jump relationship derived
  from `src/sizes.ts`. `scripts/play-bot.mjs` grew a `march` mode, and measuring the retry is what
  caught a one-frame keyboard pulse the game's tick never samples.

### Fixed

- **The P6 wait no longer paints a red annotation on a green run.** `tsc` prints
  `file.ts(11,3): error TS2305: …`, and GitHub's runner has a matcher for exactly that shape, so the
  line that says "a release is staged" came back as `##[error]` — a false statement about a run that
  succeeded. `scripts/lib/diagnostics.mjs` rewrites the diagnostic to `file.ts: TS2305: …` for the
  wait only; a real failure keeps its position, because that is the first thing a reader wants.
  Tested by four cases (the exact line main's CI printed, a Windows path, an already-quiet line, and
  a line that is not a diagnostic), including the assertion that the raw line matches the annotation
  shape and the rewritten one does not.

### Added

- **The README opens with the four samples, and the table cannot go stale.** Pickup, Camp, Parry,
  Runner and the API docs are one table at the top, and each sample's own `README.md` now links its
  page. The table is read back against `glyphArenaPage` in each example's `package.json` — the same
  declaration `assemble-site.mjs` publishes from — so a sample added without a row is red, a row for
  a page nobody publishes is red, and a sample that stops linking its own page is red too
  (`scripts/demo-links.test.mjs`, in `test:scripts`). The base URL is imported from
  `check-served-bundles` rather than written twice, and the deploy keeps verifying that each built
  page is the one the live site serves.

## [0.4.0] - 2026-11-18

The version that adds a module — `@fogrexon/glyph-arena-chase` — and `tagIn(map, tag)` on the tile
map. Adding exported names is a minor under 0.x, so this is `0.4.0` and not `0.3.1`. It also changes
what a release *checks*: `e2e:published` P6 compiles the documents on `main` against the version npm
actually serves, so a document that runs ahead of the registry is named (`PEND`) instead of shipped
silently.

### Added

- **`e2e:published` P6: the documents on main, compiled against the version npm serves.** P3 proves
  the tutorial and README work with the tarball this workspace is about to publish, and it stayed
  green while main's documents were eight hours ahead of what a reader could install: the workspace
  had `tagIn`, `@fogrexon/glyph-arena@0.3.0` did not, and a one-page dry run from the site stopped on
  its first import (`does not provide an export named 'tagIn'`). P6 installs `@latest` from the
  registry into an empty project and compiles the same two programs against it. When the workspace
  version is the published one that is the gate: red, naming the export that is missing. When the
  workspace is ahead, a release is staged, and the check prints the version it waits for instead of
  blocking every pull request until that release ships — a named `PEND` with the version and the
  error, not a silent pass. `packages/glyph-arena` moves to **0.4.0** so that state is explicit.
  Reverse check: with the version put back to 0.3.0 the gate fails (`FAIL P6 … has no exported member
  'tagIn'`, exit 1); with 0.4.0 it is the named wait.

- **`tagIn(map, tag)` — the tag written once, and the four questions it answers.** A platformer asks
  about its floor three ways — one cell, a box, and the ground under a foot — and all three samples
  wrote the same wrapper for each, passing `"solid"` again at every call. A misspelled tag is not an
  error in this package: it is a map where nothing is solid, so the body falls through the floor
  with no message. `tagIn(map, tag)` binds the word to the map and returns `{ has, inRect,
  surfaceBelow, cells }` — the four functions that take a tag, with the tag supplied once. **The map
  is an argument, not a global**: runner swaps maps at `loadLevel`, so its probes are bound per
  level, because a probe bound once at module load collides level 2 against level 1's walls and that
  reads as "the new level's floor is wrong". **Applied to all three samples**: `"solid"` is written
  once per game (runner also `"hazard"`, camp also `"spawn"` and `"enemy"`), camp's two wrappers are
  now the bound functions themselves, and the tutorial's `solid` is `tagIn(map, "solid")` with
  `stepBody(..., solid.inRect, ...)` and `solid.has(col, row)` in the draw loop. An addition to
  `tilemap`, not a new package: the umbrella still exports 20 modules.
  Tested by five cases (the binding agrees with the three functions it wraps across the whole map,
  two tags on one tile stay apart, an unknown tag answers "no" everywhere rather than throwing, a
  probe keeps the map it was given when a second map appears, and the half-open edges are
  `solidInRect`'s), plus `e2e:runner`, `e2e:demo` and `e2e:tutorial` in a real browser.

- **Camp's enemies take turns: no two commits inside 300 ms.** Three bodies in one room were not a
  hard fight, they were an unanswerable one — the interval between one lunge starting and the next
  measured **median 1900 ms but min 116 ms**, and 116 ms is shorter than the 180 ms a roll locks
  steering for, so the second commit landed while the answer was still locked. `ENEMY_AI.commitSpacingMs`
  (300, measured) makes an enemy that is in range but not next hold its ground rather than commit:
  **the queue was unfair, not the body.** Re-measured with the rule: `commit gap` min **300 / 316 /
  300 ms** (bold) and 1034 ms (careful), `danger gap` min 299–317 ms (bold). The two-camp fight does
  not move — bold 10.5 s and four hits, careful 36–38 s and no hits, the same totals as before the
  rule — because with two bodies the queue never binds.

- **Camp's second room holds three, and the world is closed on its left.** With the queue in place
  the third body adds a decision instead of a second impossible one: five enemies, two in the open
  and three under the rocks. Measured on the shipped bundle: **careful clears 6/6 in 42–54 s, five
  of them with hearts 5** (the one hit was taken while free — `blade: idle`, `since 51` — which is a
  place, not a lockout), **bold clears 3/3 in 11.9 s with hearts 1** (four hits): fast-and-hurt
  against slow-and-untouched, on the same level. The left column is a wall now, and it is not
  decoration: the tilemap treats out-of-map cells as empty, so a knockback at the first camp could
  push the player past `x = 0` into a world with no ground — measured `x -104`, every enemy stuck in
  `walk`, 48 s of nothing and no way for the run to end. The level test holds the wall.
- **`@fogrexon/glyph-arena-chase` — the pursuit rule both samples had written twice.** runner and
  camp each measured the gap between centres, took its sign, and tested it against a sight radius,
  and each learned the same two lessons on its own: a pursuer that walks off a ledge is not a
  pursuer, and a pursuer that probes the ground in the direction it is *facing* rather than the
  direction it is *about to walk* turns the wrong way. `chaseTarget(self, target, config,
  groundAhead)` returns `{ noticed, dir, distancePx, walkable }` and nothing else — no state (patrol,
  the wait before starting, how long sight has been lost are the caller's memory), no speed and no
  `dt` (one game moves a plain `x`, the other feeds a body), no default numbers, and
  `groundAhead` is called with the `dir` the call returns, so "the way it looks" and "the way it
  walks" cannot disagree. Distance is centre to centre, `dir` keeps its current facing when the
  centres coincide, and a hole (`±Infinity`, `NaN`) is never walkable. **Applied to runner**: the
  two predicates and `CHASE.stepTolerancePx` are gone, and `enemy.ts` keeps only speed and memory.
  **The runner's rule gets stricter in two visible ways**, which is the point of the unit: it no
  longer starts from on top of a one-tile lip (tolerance is one number, and this game passes `0`),
  and a pursuit ends when the runner leaves sight instead of walking on regardless. Umbrella
  exports 19 → 20 modules; `check:package-entry-points` reads that count from `packages/`.
  Tested by C1–C7 (the sight boundary at exactly `sightPx` and `+0.01`, the coincident-centre
  facing, centre-to-centre 58 px where left edges say 60, holes including `-Infinity`, the 32/33
  step boundary, two identical calls, and the probe direction) plus the runner's own numbers.

- **`examples/camp/README.md` is the game's one page, and it is checked.** The loop, the three verbs
  and what each of them costs (a 300 ms swing, a jump with no steering in the air, a 180 ms roll that
  is invulnerable for 140 ms of it), the enemy queue, the rooms, and the acceptance numbers — bold
  clears 3/3 in 11.9 s with one heart left, careful 6/6 in 42–54 s with no hits taken in 5 of 6.
  `scripts/camp-readme.test.mjs` reads every value in the page's tables back out of the source, and it
  searches **inside the named object**: `ENEMY_STATS.sightPx` and `ENEMY_AI.sightPx` are both 260, so
  a whole-file search passes for either one — the reverse check produced exactly that before the page
  was merged.

### Added

- **The tutorial's phone program is compiled and walked, not just described.** `## The whole file,
  on a phone` is the tutorial's second complete program: the same game wired to a pad. Until now the
  three things that only go wrong on a phone — `fitToWindow`'s `onResize` hook, `measureCanvas`, and
  `toCanvasPoint` — were snippets spliced into the desktop program, so nothing compiled or ran them.
  Now `pnpm -r typecheck` and `pnpm -r build` compile it (`scripts/extract-tutorials.mjs` writes
  `fixtures/tutorial/phone-whole.ts` **verbatim** — no harness line, so the file the gate runs is
  the file a reader copies), and `e2e:tutorial-phone` drives it with a thumb at **390×844, touch,
  DPR 3**: the canvas is the window, frames keep coming, a thumb on the right zone walks while the
  camera holds the body, a thumb on the jump zone lifts it, and after the window grows to 414 px a
  point that is inside the pad **only at the new width** still walks — which only happens if
  `onResize` rebuilt the pad. A canvas styled to half its bitmap width still puts the thumb in the
  zone drawn under it, which is `measureCanvas`/`toCanvasPoint` doing their job rather than being
  called. **The two programs may differ only inside `// phone-begin` / `// phone-end` segments** (4
  is the ceiling; a fifth means it is a second program): `test:scripts` compares everything outside
  them, byte for byte. Reverse-checked: one byte changed outside the segments fails that comparison,
  removing `toCanvasPoint` fails only the half-size check, and rebuilding the pad with a stale width
  fails only the resize check. **One extractor** now writes all three generated programs
  (`scripts/extract-tutorials.mjs`); the two per-file scripts are gone, and `tutorial:extract` no
  longer knows about only half of them.

- **`e2e:tutorial` walks the phone now — the viewport and the pad's zones.** The tutorial's
  `On a phone` section is four snippets spliced into the program above, so it had never been
  compiled or run: three are inserts into code that already exists. The fourth is
  `buildPad(width, height)`, and it is the one that broke for people outside this repo — `size` was
  a constant 120, three squares plus margins need 432 px, so on a 390 px phone the right zone and
  the jump zone overlapped by 30 px (60 px at 360) and a thumb in the overlap **walked and jumped at
  once**. The gate now does two things. **T8–T10**: the tutorial's own program is loaded at
  **390×844 with touch, DPR 3 and an iPhone user agent**, and the canvas must be the window's size,
  painted, with frames advancing. **T11**: the fixture extracts the published `buildPad` block
  verbatim (`fixtures/tutorial/phone-pad.ts`, +1 harness line exporting it), serves it on its
  own page, and probes the zones **point by point at 360 / 390 / 414 / 432 px** — every sampled
  point must belong to **at most one** zone, and all three zones must answer somewhere. The probe
  walks the pad instead of repeating the size formula, so it measures the doc, not the gate's copy
  of it. Measured: `360: left 24–118 / right 132–226 / jump 240–334`, `390: 24–128 / 142–246 /
  260–364`, `414: 24–136 / 150–262 / 276–388`, `432: 24–142 / 156–274 / 288–406` — matching the
  arithmetic in the section. Reverse check: putting `const size = 120` back into the generated block
  turns **T11 red at 360 (450 sampled points answering twice), 390 (225) and 414 (45), and green at
  432** — the width where the constant fits. `test:scripts` adds 8 tests (47 → 55), including one
  that fails if the size ever becomes a constant again.

### Added

- **the outside reader's path is a gate now: pack the tarball, install it into an empty project,
  compile both documents, and run the tutorial's program.** Every other check resolves the umbrella
  to `src/` through `tsconfig` `paths` or a workspace link, so none of them ever looked at what npm
  hands out — and that gap has already produced a false green: the docs described four functions a
  released version did not export, and every workspace gate stayed green because the workspace had
  them. `pnpm e2e:published` (CI step 12) does what a reader does: **P1** `pnpm pack` produces a
  tarball that ships `dist/index.js` and `dist/index.d.ts`; **P2** it installs **offline** into an
  empty project (`npm install --offline`, no links, no `paths`); **P3** the README's example and the
  tutorial's "The whole file" both typecheck there — and **P3b** re-runs the compiler with
  `--traceResolution` to prove the declarations used are the **installed** ones and that no
  workspace `src` path appears, because a returning `paths` mapping would quietly turn this gate
  back into a workspace check; **P4** the tutorial is emitted and runs in a browser with an
  **import map** (nothing is bundled — the bytes executed are the ones npm installed): a painted
  frame with the body on it, the world sliding under a fixed body while ArrowRight is held, frames
  advancing; **P5** no console errors and no missing assets. Negative control: turning
  `export function createDraw` into a private function in the draw package before packing turns
  **P3** red naming both documents (`readme.ts(1,10)` and `tutorial.ts(4,3)`) and stops **P4** — the
  exact false green from the fifth dry run. No lockfile change: the script is the only new file.

### Added

- **the umbrella `README.md`'s only example is compiled and run in CI — it is the one document that
  freezes.** The README ships inside the tarball, so npm shows it unchanged until the next version:
  a block that does not compile would ship and nobody could fix it. `check:readme` only ever proved
  the module names are listed and that `draw.rect` / `draw.text` appear somewhere — never that the
  fifteen lines a reader copies actually work. Now `fixtures/readme` is a real workspace package
  whose `typecheck` and `build` scripts extract that block from `packages/glyph-arena/README.md`
  first, using the same extractor as the tutorial (`scripts/lib/markdown-program.mjs`; the tutorial's
  `wholeFileProgram` is now a thin call to it). Three gates, each for a different failure:
  `pnpm -r typecheck` compiles it against the workspace sources; **`pnpm check:readme-example`
  compiles it against `packages/glyph-arena/dist/index.d.ts`** — the declarations the tarball
  actually carries, so a name that exists in `src` but not in the published surface is caught; and
  `pnpm e2e:readme` (CI step 11) serves the built page and reads the canvas — the frame painted, the
  label drawn, `requestAnimationFrame` advancing, and the rectangle **moving** (its `x` is
  `40 + Math.sin(elapsed) * 60`, so a still rectangle means `elapsed` never advanced although frames
  did). The two browser gates now share `scripts/lib/static-server.mjs`, which answers the favicon
  with 204 and keeps the list of requests it could not answer, so a failure names the path instead
  of "Failed to load resource". `test:scripts` adds 11 tests (36 → 47), including one that pins the
  fixture page to what the block looks up (`#game`). Reverse checks: a type error in the README
  block turns `pnpm -r typecheck` red; making `Math.sin(elapsed)` constant leaves the page painting
  and only R5 red; deleting an export from `dist/index.d.ts` turns `check:readme-example` red,
  which is what proves that gate reads the published declarations rather than the sources.

### Changed

- **camp's overlap rule says what it is, and runner's design height says what it is not.** `overlaps`
  is `overlapsHalfOpen` now. The library's `collide.overlaps` is **closed** (`a.x <= b.x + b.width`,
  documented as "overlap or touch on an edge or corner") and pickup and parry use it; camp's is
  half-open, so a blade whose tip is exactly on an enemy's edge has not arrived, and
  `combat.test.ts` has pinned that rule since it was written. Merging them would move every hit one
  frame earlier at the exact-touch boundary — a tuning change at the point CAMP was measured to,
  not a cleanup, so the two rules stay and the names now say which is which. `LOGICAL_HEIGHT` in
  runner is the design height (`scale() = canvas.height / 540`), not a screen scale: `screenScale`
  is bitmap pixels per CSS pixel and is 1 on both axes here, because `fitToWindow` gives the canvas
  a bitmap the size of the window. Behaviour unchanged — every changed line in this unit is an
  identifier or a comment.

### Fixed

- **Every runner level is closed on both sides.** The floor rows were solid at the edges and the rows
  the body stands in were not, and outside the map is sky, so the first `ArrowLeft` walked the body
  to x -180 and y 658 (the world is 13 rows, 416 px tall); the respawn put it back outside, and the
  run died three times in four seconds. Both edge columns are now solid on every row of all three
  levels — holding left stops at x 32 with no deaths — and a unit test per level names the reason so
  the next level cannot reopen it. The tutorial's level had the same hole.

## [0.3.0] - 2026-11-18

The first version that ships `screen` and `touch`. `0.2.0` was the first npm publication and has
neither, so the tutorial's `On a phone` section cannot compile against it: it calls
`createTouchControls`, `fitToWindow`, `measureCanvas` and `toCanvasPoint`. Everything listed below
has been on `main` since that publication.

### Added

- **the tutorial's "The whole file" block is compiled and run in CI, so the one path an outside
  reader walks cannot rot.** That block is the whole onboarding story: copy it, import
  `@fogrexon/glyph-arena`, run it. It lived only inside a Markdown fence, so `pnpm -r typecheck`
  never saw it — and two breakages reached readers that way (a spawn inside the floor, and `jump`
  fed the held state instead of the press). Now the block is the *source*: `fixtures/tutorial` is a
  real workspace package whose `typecheck` and `build` scripts run
  `scripts/extract-tutorial.mjs` first, so `pnpm -r typecheck` and `pnpm -r build` compile the
  docs' own program and a docs edit that does not compile goes red at the step that already exists.
  The extractor refuses to guess (`scripts/lib/tutorial.mjs`): the heading must be exactly
  `## The whole file`, exactly one `ts` fence may sit in that section, the fence must be closed,
  and the only `@fogrexon/…` import allowed is the umbrella package — the subpackages are workspace
  internals, so a reader who copies one gets a module npm does not have. `pnpm e2e:tutorial` then
  serves the built page from 127.0.0.1 and reads the canvas in the tutorial's own colours: the
  frame painted, the body is on it, `requestAnimationFrame` keeps advancing, and holding
  ArrowRight **moves the body through the world** — the camera holds it at a fixed screen spot
  while the tiles slide under it, which cannot happen if input never reaches `stepBody`.
  `test:scripts` adds 12 tests, one per way the extraction could go wrong. Reverse checks: deleting
  `stepBody` from the generated program leaves the page painting and only T5 red (a first version
  of T5 asserted "the body rests on a tile" and that build passed it — the tutorial spawns already
  standing on one); a subpackage import in the block turns the extractor red by name; a one-line
  type error in `docs/tutorial.md` turns the existing `pnpm -r typecheck` step red with the line.

### Changed

- **`camp`: the harness prints the interval between commits, and it answers the question the roll
  was built for.** `danger gap` is the gap between one enemy starting a commit and the next one
  starting, across all living enemies. With one enemy it is `restMs + windup`; with several it is
  whatever the stagger makes it — and a roll that locks steering for 180 ms only works if that
  number stays above it.

  Measured on a three-enemy second camp (`index-Cf3pZXIV.js`), the bold bot, one run:

  ```
  danger gap: median 1900 ms   min 116 ms   n 5
  ```

  **The median is generous and the minimum is not.** Two enemies can commit 116 ms apart, which is
  shorter than the roll's lock — so no single committed verb can answer two staggered commits, and
  every hit in that run landed while the player was in its **own** swing (`blade: "recovery"`) or
  its own roll. That is why the levers in order — i-frame, interval, health — do not reach it:
  a longer i-frame cannot help when the second commit arrives inside the first one's recovery, the
  interval is already 1.9 s at the median, and more hearts buys a hit, not an answer.

  The level stays at **two camps of two**, and the three-enemy version was reverted rather than
  shipped as a difficulty spike. What would fix it is a **minimum spacing between commits across
  enemies** — a coordination rule, so it is a proposal and not a patch.


- **`camp`: a third verb — a roll with a window it cannot be hit in.** Attack answers "hit it" and
  jump answers "leave"; neither answers "it is already on me". The roll is a **commitment**: 180 ms
  at 520 px/s (the run is 300), steering locked for its whole length, 420 ms before another, and the
  window where the commit cannot touch you is **140 ms — shorter than the roll**, because you are
  buying the crossing, not immunity.

  Keys: `Shift` or `L`. The state publishes `dodge: "idle" | "roll" | "cooldown"` so a test can ask
  "may I roll" instead of counting frames, and the harness now prints `dodges` per run.

- **`camp`: the acceptance for it is not met, and the level was put back.** The plan was three
  enemies in the second camp, with the roll as the answer. Measured, on the three-enemy level
  (`index-Cf3pZXIV.js`):

  ```
  careful, rolling at every tell   33 dodges, 0 kills, 60 s cap
  careful, rolling at gap < 45     7 dodges, 1-3 hits, 0 kills, 60 s cap (3/3)
  bold, no roll                    3/3 down at 12.1 s with four of five kills
  bold, rolling at gap < 45        1/3 clear, 2/3 down
  ```

  The roll fires — the counter proves the press reaches the game — but **no policy for using it
  found a window**: rolling costs 180 ms of steering, and with three commits in flight there is
  always another one when the roll ends. So the level stays at the accepted state (two camps of two)
  and this ships the verb, not the fight.

  On the shipped level the measured lines are **unchanged**, which is the check that matters:
  `bold 10.56 / 10.65 s, hearts 1, clear 2/2` and `careful 39.3 / 40.7 s, hearts 5 (0), clear 2/2`,
  with `dodges 0` in both — the bot does not use the verb, so the acceptance that was measured on
  11-18 still holds.

- **`play-bot.mjs`: a hit is blamed on the enemy that can actually hurt you.** `camps` summed to
  four hits on a run that ended at zero hearts from five: the blame went to the *nearest* enemy, and
  the offender is only the **lunging** one (the game damages on a lunging overlap and nothing else).
  It also read `lastHearts = 3` as a constant; it now takes the game's own number on the first frame.


- **`camp`: the harness reports per camp, and it answered the question it was built for.** Two camps
  made a run twice as long, but "the second camp is a different fight" was a claim about *the second
  camp* and every number was a total. `pnpm camp:bot` now prints one line per camp — tells, lunges,
  hits, hearts lost — with the camps **derived from the spawn layout** (split where the gap is more
  than twice the tightest pair, not at a written-down index, so moving an enemy cannot silently
  re-label the fight).

  The answer, three runs, on the bundle the run reports (`index-BTtthii5.js`):

  ```
  bold     10.56 / 10.58 s          hearts 1        clear 2/2
     camps [camp 1: 4 tells, 2 lunges, 8 hits, 2 hearts] [camp 2: 4 tells, 2 lunges, 7 hits, 2 hearts]
  careful  38.08 / 38.32 / 39.85 s  hearts 5 (0)    clear 3/3
     camps [camp 1: 11-12 tells] [camp 2: 12 tells]
  ```

  **The second camp is the first one again.** Same tells, same lunges, same damage. The run doubled
  and the decisions doubled with it, but the wall at the second camp's back changes nothing, because
  the player always arrives from the left and retreats to the left — the corner is never behind them.
  Tightening the second pair from four tiles to two was measured too and changed nothing either
  (bold's per-camp line was identical), so that was reverted rather than kept as scenery.

- **`camp`: the careful bot was backing off from the wrong enemy.** `telling` and `lunging` were
  computed across *every* living enemy, so a tell two bodies away froze the bot in a retreat and it
  never stood still long enough to take a window. With four enemies that is a stall, not a caution:
  measured, one run in three ended at the 60 s cap with seven arrivals and one kill. Reading the
  *target's* mode instead — the enemy it is actually fighting — made it **3/3 clear at 38-40 s with
  no damage taken**. The bold line did not move (2/2, 10.6 s, two hearts a camp), which is how we
  know the fix touched the retreat and not the fight.


- **`camp`: two camps, so the run is a run.** The level had one fight at the end of a walk: a bold
  run was 7.2 s and eight tells, so the decision the fight is built around happened four times.
  Now the enemies come in pairs twenty tiles apart — fight, walk, fight — with the second pair under
  the hanging rocks and the wall at its back, so the same question is asked in a smaller room. Four
  enemies, no new rule: the same spawn tag, twice over.

  Two numbers moved with it, and both were forced by measurement rather than taste. **Hearts 3 -> 5**
  is the run's expected damage: at three, an unbroken masher cleared the first camp and died at
  8.4 s with the last enemy standing. **And enemy hp stayed at 4** — dropping it to 3 was the first
  thing tried, and it made the longer run *safer* (`12 swings, 0 lunges, 0 damage`), because twelve
  swings cancel every tell before it lands. Swings are exposure, so the health is the lever that
  keeps "fast and hurt" a way to win.

  Measured in a Pod (Chromium 156), three runs each, on the bundle the run reports
  (`index-BTtthii5.js`):

  ```
  bold     10.33 /10.49 /10.59 s   hearts 1-2 (took 3-4)   clear 3/3
  careful  36.26 /37.94 /40.89 s   hearts 5 (took 0)       clear 3/3
  ```

  **3.5x the time for zero damage**, and the tells say the same thing from the other side: bold
  meets **8** of them, careful **22-25** — five times as many decisions, paid for in wall time. Before
  the second camp existed the same two lines read 7.2 s / 4 tells against 18 s / 11.


- **`pickup-demo`: the last hand-written pad is the library's, and it took a bug with it.** The
  oldest sample still carried its own hit test — `Math.hypot` against `TOUCH_PAD_RADIUS * 2.5` and a
  per-axis dead zone — and, more importantly, it read `snapshot.pointers[0]`: **whichever finger
  landed first**. On a phone that is usually the thumb resting somewhere else, so the d-pad was dead
  while the thumb on it did nothing. `createTouchControls` owns the hit test, the dead zone and
  "which finger is this stick following" now, and the numbers that were unexplained are named:
  `TOUCH_PAD_REACH` is `2.5x` the drawn disc **because the thumb covers the disc it is aiming at**,
  and `TOUCH_HOLD_MS` is the hold `touch` asks for as a required value.

  Measured in a Pod (Chromium 156, `e2e:demo`, iPhone user agent, DPR 3): the four directions still
  move (`left 111 / right 45 / up 108 / down 108 px`) and the new case passes —
  **`a second thumb resting elsewhere does not steal the d-pad` (108 px)** with a finger held at the
  top-right for the whole press. The old code cannot pass that line: `input` builds its pointer list
  with `Array.from(pointers.values())`, a `Map` in arrival order, so the resting finger *is*
  `pointers[0]` — a coordinate 160 px from the pad, which is no direction at all.


- **the gallery's pages come from their own declarations, so a new sample cannot ship
  unreachable.** CAMP was built, deployed, and linked from **zero** pages: the nav was four
  hand-written `<a>` lines copied into three `index.html` files, and the deploy carried four
  hand-written `pnpm --filter … build` lines each with its own `PARRY_BASE` / `RUNNER_BASE` /
  `CAMP_BASE`. Three lists that had to agree, and only two were updated. Now each example declares
  `"glyphArenaPage": { "path": "/camp/", "label": "Camp" }` in its own `package.json` and that is the
  only list: `scripts/build-examples.mjs` builds every declared example with the `GLYPH_BASE` its
  path implies, `scripts/assemble-site.mjs` copies it **and injects the same nav into every page**
  (a page with `<nav class="gallery-nav" data-glyph-nav></nav>` says where it goes; a page that says
  nothing gets it before `</body>`). The workflow now names no example at all.
  Verified by adding a temporary fifth sample: `node scripts/build-examples.mjs` built it without an
  edit anywhere, and it appeared in all five navs — then the sample was deleted. `test:scripts` adds
  `scripts/assemble-site.test.mjs` (12 tests: the declaration, the order, `aria-current`, the page
  with no nav at all, the "add one sample, every page follows" case, and the refusals — a duplicate
  path, the old one-word declaration, no root page, a declared page that was never built).

- **`screen`: one place that knows the CSS box, the bitmap, and the ratio between them.**
  `@fogrexon/glyph-arena-screen` is the 19th package, and it exists because two samples wrote the
  same conversion and three wrote the same resize. `toCanvasPoint(point, box, size)` is the
  pointer conversion — including the `rect.width === 0 ? 1` guard, which both copies had and which
  only matters while the page is hidden (a zero box otherwise turns every later coordinate into
  `NaN`, and a game does not recover from that). `fitToWindow(canvas, window, { onResize })` sets
  the bitmap to the window, listens for `resize`, and runs `onResize` **after** the new size is in
  place — which is where a touch pad belongs, because its zones are geometry in canvas pixels and
  rebuilding them on the frame would drop a press in flight. `touch`'s header said the conversion
  "belongs to a screen-space package"; this is that package, and `touch` / `input` stay DOM-free.
  Nothing imports `HTMLCanvasElement` or `Window`: every function takes the smallest structural
  shape, so the maths is tested with numbers (10 tests, including one that proves a zero box scales
  by 1 and one that a point outside the box stays outside, sign and all). Reverse check: dropping
  the zero-box guard turns exactly that one test red. Adding the package also turned two of the
  "you forgot something" gates red, both correctly: `docs:render` named the missing
  `docs/api-screen.md`, and the three samples' builds named the missing workspace dependency.

- **`camp`: the fight is a choice, and it is measured.** Three numbers moved and each one has a
  measurement behind it. The lunge range went **110 -> 70 px**: the commit covers 138 px, so a
  110 px trigger meant every place you could stand was a place the lunge reached and there was no
  safe spot to think in. The rest after a lunge went **300 -> 450 ms**: 300 ms is shorter than the
  swing you have to commit to (300 ms) plus the 125 ms it costs to reverse a retreat, so the reward
  for reading the tell was a window nobody could step into. And **the second half of the tell is now
  armoured** — only a hit in its first 130 ms cancels the lunge. With the whole tell cancellable, a
  bot that never stopped swinging cancelled every tell (`tells 4 lunges 0`, 7.0 s, no damage), which
  made mashing strictly better than reading: no choice, just a correct answer.

  Measured in a Pod (Chromium 156) with `pnpm camp:bot bold|careful`, three runs each, on the bundle
  the run itself reports (`index-CMS2xY4C.js`), plus the runner's three levels in the same harness
  (`index-Zher5vOm.js`):

  ```
  bold     7.22 / 7.25 / 7.26 s   hearts 1 (took 2)   clear 3/3
  careful 17.83 /18.93 /19.31 s   hearts 3 (took 0)   clear 3/3
  runner   goal 3/3               deaths 1            21529 ms
  ```

  **2.6x the time for zero damage**, and every hit bold takes lands while its own blade is in
  recovery (`blade: "recovery"`, 19-21 frames after the press): it committed, so it ate the commit.
  That is the exchange, not a dominant strategy.

- **`scripts/play-bot.mjs`: the acceptance for a slice is a rerun, not a rewrite.** Camp (both
  strategies) and the runner's three levels in one harness — `pnpm camp:bot bold|careful` and
  `pnpm runner:bot`. A number is only useful if the next person can reproduce it, and on 11-17 the
  measuring device itself was wrong four times (a "careful" bot that never engaged and sat silent
  for 57 s, a jump timed 150 px early, take-off points remembered from a level that had moved — 95
  deaths from that one — and a cold first run counted). Two of those failures are now impossible by
  construction: the runner's take-off windows, pits and hazards are **derived from `levels.json`**
  (a spike hanging in the air is not a take-off point; one standing on the ground is), and the bundle
  name is read **from the page being played**. Everything else is printed per run — tells, lunges,
  presses, the frame a swing arrived at, and for each hit taken, what the bot was doing when it
  landed. That is what turned "the bot dies" into "the bot was still drifting backwards when the
  window opened".
- **`loop`: the step the world sees is the loop's.** `createLoop({ maxDelta })` sets the largest
  step `delta` may report, in seconds (default `0.1`, unchanged). All four samples opened `onFrame`
  with `Math.min(time.delta, MAX_FRAME_DELTA)` and their own constant — for `parry` and
  `pickup-demo` that number was **exactly the loop's 0.1**, so the line was an identity dressed as
  protection; `runner` (`1/30`) and `camp` (`0.05`) genuinely needed a narrower step, which the two
  of them kept re-applying one frame after the loop had already clamped. Now `delta` **is** the step
  the world sees. `elapsed` is still not clamped (the `Σdelta ≠ elapsed` trade after a stall is
  unchanged), and `0`, negative and non-finite values throw a `RangeError` at construction — a zero
  step is a game that silently never moves, and the constructor is the last place that is visible.
  Verified locally (`pnpm -r typecheck` / `build` / `test` / every gate green; `loop` 15/15) and in
  CI's browser steps (`e2e:demo`, `e2e:runner`). Reverse check: making the loop ignore `maxDelta`
  turns exactly the new L5 red.

- **`tilemap`: finding cells by tag is the library's now.** `examples/runner/src/level.ts` and
  `examples/camp/src/level.ts` each opened the map and walked `mapRows` × `mapColumns` looking for a
  tag — the runner to find the first `@` (the start) and the goal, the camp to find every `@` and
  `e` — and each multiplied by its own `TILE` at the call site. Both now call
  `cellsWithTag(map, tag)`, which returns `{ column, row }` in reading order. Reading order is the
  contract and not an accident: a run starts at the **first** spawn point in the text, so
  `cellsWithTag(map, "at")[0]` is the start, and a set-ordered walk would make it a coin flip. This
  is the half of `hasTag` that was missing — the package's own header promises that nobody outside
  writes a cell↔pixel conversion, and an enumeration loop is that conversion written the long way.

- **`input`: a click or a tap that ends between two frames is no longer lost.** `snapshot().pointers`
  now means "down now **or** landed since the previous snapshot", for exactly one frame, carrying the
  position it landed at. This is the third path with the hole the keyboard had: `pointerdown` +
  `pointerup` inside one frame were never down, so the title screen did not start and a menu item did
  not fire. A pointer that is still down answers with its live position and is listed once. Three
  paths, one definition — `touch`'s `down`/`held`/`pressed`, the keyboard latch, and this one.
  Verified in a Pod (Chromium 156): `e2e:runner` drives a real `page.mouse.click` (down and up with
  no delay, the exact case that used to vanish) and the run starts; `e2e:demo` unchanged and green.

- **both platformers draw the library's columns.** `examples/runner/src/main.ts` and
  `examples/camp/src/main.ts` each wrote `Math.max(0, Math.floor(x / TILE) - 1)` /
  `Math.min(columns - 1, Math.floor((x + width) / TILE) + 1)` by hand. Both now call
  `visibleColumns(map, leftPx, widthPx, { margin: 1 })` — the same ±1 column of slack, written
  once, in the package that owns the px→column conversion. The ranges are the same numbers: with
  `margin: 1` the library's half-open `[first, end)` covers exactly the columns the old inclusive
  loop drew, which is why this is a refactor and not a change of picture.
  Verified in a Pod (Chromium 156): `e2e:runner` green, and camp still paints a full-width band of
  tiles (2460 tiles over the viewport, one margin column outside each edge, 0 page errors).

- **`input`: a press that lands and lifts between two frames is no longer lost.** `snapshot().keys`
  now means "down now **or** pressed since the previous snapshot", for exactly one frame. The
  keyboard had the same frame-boundary hole the touch pads had: a `keydown`+`keyup` inside one frame
  was invisible, so every mechanical test held the key for 150 ms first — `hold(page, "Space", 160)`
  eight times over, which is a property of the harness and not of the game. It is **one frame, not a
  hold**: a keyboard is discrete events, and nothing needs a key to stay down after the player let
  go. Auto-repeat is not a second press, and `snapshot()` consumes the latch, so call it once per
  frame as the loop does.

  Measured in a Pod (Chromium 156) with every start, restart and dash press cut to **one frame**:
  `e2e:demo` green — the parry chain reads `parried 1 -> 2`, then five waves defended, and every
  `Shift`/`Space` in that run was one frame — and `e2e:runner` green. The holds that remain are the
  ones whose duration *is* the point: the 97 px pit needs the full 460 ms of a variable jump, and a
  dodge has to keep moving.

- **both samples: the on-screen pads are the library's.** `examples/parry/src/main.ts` and
  `examples/runner/src/main.ts` each carried their own hit test, their own "which pointer is on the
  pad" lookup and their own idea of what a press is. Both now call `createTouchControls` from
  `@fogrexon/glyph-arena-touch`. The DOM-to-canvas conversion stays in the sample — the package
  deliberately has no opinion about what units its zones are in — and the pads are rebuilt on
  `resize` rather than per frame, because a rebuild drops a press in flight.

  The measurement procedure lost the hold with it. `e2e:demo` and `e2e:runner` no longer press and
  sleep 150–160 ms so that a frame can see the finger: every touch check below is **one animation
  frame of finger, then up**, in Chromium 156.
  - parry: a one-frame tap starts the run, and a one-frame tap on DASH at the published `pressMs`
    parries (`parried 0 -> 1`, score 100, wave 5).
  - runner: a one-frame tap starts the run from the middle of the title screen and from the jump
    pad, and a one-frame tap on the jump pad jumps (`minVy -717 px/s`) — the press a 150 ms hold
    used to be needed for.

### Added

- **`touch`: `down(name)` — a finger in the zone now, with no hold.** Using `held` for a direction
  was wrong: the runner's right pad still answered for `holdMs` after the thumb lifted, so the
  runner walked 48 px further than the player asked (150 ms at 320 px/s, one and a half tiles) —
  over the edge they were stopping for. `e2e:runner` caught it as the pad moving 1.19x the keyboard.
  `down` is presence, `held` is a press that survives the gap between frames, `pressed` is the edge;
  the samples use `down` for movement and `held`/`pressed` for jump and dash. Two tests fix the
  difference from both sides — swapping `down` for `held` turns both red.

## [0.2.0] - 2026-11-17

The version the first npm publication carries: `@fogrexon/glyph-arena@0.2.0`. Nothing under this repository's `@fogrexon/glyph-arena-*` names is published on its own.

### Changed

- **`body` no longer carries a game's feel.** `jumpCutFactor` was optional and defaulted to `0.35`
  — how much of a rise a released jump keeps is the runner's feel, and the package's own first
  paragraph says a default there becomes the next game's. It is now **required**, the value lives in
  `examples/runner/src/physics.ts` beside `760 / 2600`, and `test/no-numbers.test.ts` enforces the
  rule mechanically: with comments stripped, the only numeric literals allowed in the source are
  `0`, `1` and `2` (a clamp's ends, and the `v² / 2g` coefficient), and every `BodyConfig` field must
  be required. QA's point was that a gate looking for `760` would let `0.35` through — this one does
  not: putting the default back turned two tests red (`a number that belongs to a game is in the
  package: 0.35`, `optional config fields are defaults in disguise`).

- **runner: the body is the library's body now.** `examples/runner/src/physics.ts` went from 110
  hand-written lines to **75 (36 of them code)**: gravity, acceleration, the jump with coyote and
  buffer, and axis-separated resolution now come from `@fogrexon/glyph-arena-body` (its charter:
  no numbers, no grid). The numbers live in one `CONFIG`, and the tile size is passed as `grid`
  instead of being written `32` in three places. The old export names are kept
  (`createBody/stepBody/jumpHeight/GRAVITY/...`) so `main.ts` and the tests read the same functions
  — a refactor that renames call sites hides whether the behaviour survived.
  **Measured in a Pod (Chromium 156), one run through all three levels: `phase "goal"`, level 3 of
  3, deaths 0, 28.0 s, console errors 0**, with the same scripted take-off points as before.
  `e2e:runner` green.

### Added

- **runner: level 3 has a pursuer.** It notices you within **224 px**, waits out the level's first
  **1.0 s**, and then walks at **90 px/s** — the run is 320, so flat ground always lets you leave
  it; what it punishes is **standing still** (224 px is 2.49 s). It refuses to jump, climb or walk
  off a ledge: any height change ends the pursuit and it goes back to patrolling its lane, and
  1.5 s out of view loses it for good. Touching it kills you with the existing `cause: "enemy"`.
  The rules live in `enemy.ts` as pure functions so the unit test can pin the boundary (224 in,
  225 out) instead of the game and the test each carrying a number.

- **`__runnerState.enemies` carries two entries on level 3.** The list was already the shape; the
  pursuer is the second element with `mode: "chase"` while it is coming for you, which is what
  makes "a thing patrols" and "a thing is hunting you" distinguishable from outside without
  watching the pixels. Enemies also **go back to their start on every respawn**: otherwise the
  pursuer stands on the safe spot and kills you on the frame you return — the spike trap one layer
  up, and the reason a retry has to be a retry.

### Fixed

- **the deploy no longer keeps a record — it compares the real thing with the real thing.**
  `docs/bundles.json` was a *proxy* for "the deploy landed", and a proxy drifts: today `main` was
  green while Pages served a bundle two deploys old (the deploy is outside the CI gates). The file
  is gone, with `scripts/check-deployed-bundles.mjs`, `scripts/lib/record-pr.mjs` and its test.
  Instead the deploy workflow runs `assemble-site.mjs` — where each demo is published comes from its
  own `package.json` (`glyphArenaPage`), not from three hand-written `cp` lines — and after
  publishing, a `verify-deployed` job compares **the `index-*.js` named by each page in the build
  artifact** with **the `index-*.js` the live page names**, retrying for three minutes while Pages'
  CDN catches up. A mismatch is a red run; it commits nothing, so it cannot loop and never needs to
  write to `main` (which requires a PR, `verify`, admins included). The page list is read from the
  built tree, so an added example is checked the day it is added — the fifth hand-kept list today,
  retired instead of fixed.

- **`I14` asserted the bot's skill, not the game.** The parry end-to-end run played until wave 21 to
  prove "the run does not stop at twenty waves". That is a property of `waveShapeAt()` — a pure
  function with no RNG, already covered for indices 20..199 by `examples/parry/test/waves.test.ts` —
  and re-testing it by playing meant the check passed at "wave 21, score 1150" and failed at
  "wave 20, lives 0" on identical code. It now asserts what only a browser can show: that an enemy
  wrapping around the arena does not jump the nearest enemy's contact clock. The first version of
  that assertion was wrong too — it paired samples by `threat.id`, and the demo reports `id 0` for an
  enemy whose identity is not allocated yet, so two different enemies looked like one that had
  teleported (4104 ms -> 1189 ms at wave 15). Samples with `id 0` are skipped, the jump is bounded by
  the wall time between samples instead of a fixed 900 ms, and the run stops as soon as a wrap has
  been seen.

- **a respawn is never within 96 px of what killed you.** On levels 2 and 3 the spikes sit at
  standing height, so "grounded" and "safe" were not the same thing: the safe spot was recorded
  before the hazard check, and the tile you died on became the tile you came back to. QA measured
  **deaths 1 → 5 in three seconds**, with **17 ms** between deaths. Skipping a hazard tile is not
  enough — a respawn 0.8 px from the spikes is the same trap, just slower, and my first attempt
  only stretched 17 ms to 600 ms. A safe spot now needs **96 px of clear ground** around the body
  (300 ms at the 320 px/s run) or it is not recorded at all, which leaves the level's spawn as the
  fallback. The rule is `hazardWithin()` in `level.ts` — pure, unit-tested, the same function the
  game uses — and `__runnerState` gains **`safe`**. The distance is deliberately *not* published:
  the e2e measures it from the level grid and the unit test measures it directly, and a second
  copy would be a second thing that can go green on its own.

### Changed

- **the twelve packages stopped forbidding words.** Each one had a test asserting its source never
  contained a list of vocabulary — `follow`, `bounds`, `shake`, `layers`, `pivot`, `point`, and 33
  more across the twelve. That is why `follow` could not be added to the camera, and it is half the
  reason `packages/` went a whole day without a change: the list was checking vocabulary instead of
  the thing that actually goes wrong, *a public name appearing without anyone deciding it should*.
  Each package now asserts its **exported names** against a literal list: a new `export function`,
  `export type`, or `export { … }` name turns the package red until the author adds it, while a word
  used inside a function is not a name and cannot. A new export added to `camera` turned it red in
  the check I ran before shipping this (`+ 'Follow'`), so the guard still bites. The rule that a
  package has no runtime dependency on a sibling is unchanged and still asserted.

### Added

- **`@fogrexon/glyph-arena-body` — the physics every sample was writing by hand.** Gravity, a run
  with acceleration, a jump with coyote time and an input buffer, and axis-separated collision
  against a `solid()` test the caller supplies. `examples/runner` spent 110 lines on exactly this
  (`physics.ts`), and the same numbers had to be kept in sync with the spec by hand. The package has
  **no numbers of its own**: no default gravity, no preset, no `TILE` — `760 / 2600 / 0.09 / 0.12`
  are the caller's, and `jumpHeightOf(config)` computes the height from that same config so a spec
  and a test cannot disagree. It also has **no grid**: pass `{ grid }` to `stepBody` and a blocked
  move snaps to the cell boundary, omit it and the move is reverted. Two bugs found while writing
  it, both in my own work: the grid snap took its boundary from the position the body *left* rather
  than the one it was heading for, which teleported a landing 13 px up through the floor it was
  falling toward; and `createBody` took `width/height` while `Body` exposed `w/h`, which is the same
  "one thing, two names" that cost an hour on `stepAhead()`. Both are fixed, and the first has a
  test that lands a body on a 32 px grid and asserts the exact cell edge.

- **`approach(current, aim, dt)` in `@fogrexon/glyph-arena-tween`.** Every game in this repository
  wrote the same two lines to ease a value toward a moving aim — `value + (aim - value) *
  Math.min(1, dt * 8)` — and `examples/runner` still does, for its camera. The package now owns
  that step: the gap closes at `rate` per second, a long frame closes the whole gap instead of
  overshooting and bouncing, and a paused frame (`dt <= 0`) returns the value unchanged. It is not
  `to()`: there is no duration and no completion, only a chase, so there is no handle to leak. The
  tests pin it to the hand-written idiom over a table of values, which is what makes the port safe.

- **runner: a third level, and the ground is the pressure.** Level 3 (`level.ts`, 78 columns)
  keeps one long straight and spends the rest on places where holding right kills you: spikes on
  the ground line in front of a one-tile step (columns 10-11), spikes on the platform you land on
  from that step (columns 22-23), and spikes on the far side of a pit, so a jump is followed by
  another inside half a second. The walker in this level starts at the far end of its lane facing
  back (`dir: -1`, columns 32-37) — the first thing in the run that comes *at* you instead of
  patrolling away, and the first that you have to **wait for** rather than outrun. Same walker,
  same speed, no new behaviour: a chaser is a different unit.
- **columns 12-14 are kept flat for the pursuit enemy.** `chaseSpawnLane()` names them and
  `level.test.ts` walks the lane checking floor and clearance, so the enemy cannot be given a
  spawn inside a step by a later level edit.
- **the straight R10b measures pursuit over is a named lane.** `chaseSightLane()` returns level
  3's columns 3-8 (192 px, nothing above the floor), and `level.test.ts` checks every column of it
  — the spec fixes the columns, so the test reads the function instead of repeating the numbers
  (the `goalLineX()` rule). `levelCount` is 3 and R0 now expects `level 1 of 3`.

### Fixed

- **runner: the result screens answer a tap.** The goal screen said "R to run it again" and a
  phone has no R, so clearing level 1 left a touch player on a screen they could not leave
  (#QA, the same dead end as the title screen). Tapping the goal or death screen now does what
  the keyboard does: the goal restarts **the same level from its start** (respawning on the goal
  line would clear it again on the next frame), the death screen respawns at the safe spot, and
  neither counts a death. The goal line says "tap to run it again" on touch.
- **runner: the pit no longer ends on the walker.** Level 1's pit ended at x=1184 and the
  walker's lane started at x=1216 — **32px, one tile, of landing.** A person cannot see a gap that
  size at 320px/s: the pit jump lands you (x=1171) already inside the walker's reach, so at worst
  there is 0.13s between "I am on the ground" and "something touched me" (my scripted play died
  there 27 times in a row). The lane now starts at x=1280, which is **three tiles (96px) of
  landing**, and the floor is a test rather than a habit: `slice.test.ts` reads the pit's right
  edge and the walker's `minX` and goes red under two tiles (64px). Difficulty is unchanged —
  the walker still sweeps the same seven tiles, still kills on touch (`cause: "enemy"`), and the
  bot's 80px look-ahead was not touched, so the level still clears with the same bot. The lane
  itself moved into `level.ts` (`patrolRange()`), because a number that lives in `main.ts` is a
  number the test cannot read. `__runnerState.enemies` publishes it as an **array**
  (`{x,y,w,h,dir,mode,speed,minX,maxX}`): the chase enemy is a second element, not a rename.

### Added

- **The three demos are one gallery now.** `pickup` (`/`), `parry` (`/parry/`) and `runner`
  (`/runner/`) each carry the same four-link bar along the bottom edge — **Pickup / Parry /
  Runner / API Docs** — with the current page marked `aria-current`. Before this you had to
  know the URL to find the other two, which is most of why three demos read as three samples
  rather than one thing. HTML and CSS only: the JS bundles are byte-identical (rebuilding with
  the Pages `--base` gives `index-D1uMDI5x.js` / `index-B4DcvyZn.js` / `index-89vl59Nj.js`
  before and after, so `check:deployed` has nothing to record), and the bar sits in the bottom
  20px, below every touch control (those inset themselves at least 24px from the edge) and
  away from the HUD, which all three draw top-left. Measured in a browser at 1280x800 and
  390x844: 4 visible links, every link 200, no console errors.

### Added

- **runner: a second level, in the same notation.** Clearing level 1 now runs straight into
  level 2 — no menu, no reload — and `__runnerState` publishes `level` (1-based) and
  `levelCount`. Level 2 is written in `level.ts` in exactly the same ASCII (`# ^ @ |`), because
  if a second level needs a second format, the format is the thing that does not scale. Its one
  new demand is **height**: a one-tile step up onto a plateau, spikes on the plateau to clear,
  and the goal at the top. No walker on level 2 — two new things at once stop a level from
  telling you what killed you.
- **one source of truth for the goal line.** `goalLineX()` lives in `level.ts` and both the game
  and the bot read it, so a test can no longer pass a level the game would not clear.
- **CI plays every level, in order.** `slice.test.ts`'s bot now walks the levels from 1 to N and
  has to clear each one; `level.test.ts` checks every level by the same rules (spawn on solid
  ground, something that kills, wider than 1200 px) and asserts level 2 actually has a step and a
  pit while level 1 still has neither.
- **`e2e:runner` R0** now also asserts `level === 1` and `levelCount === 2` on load.

### Fixed

- **the bot's jump lookahead.** One 80 px lookahead jumped spikes so early that it landed on the
  far side of a spike bed (level 2, x 1227). Spikes are now read 40 px ahead and pits/steps keep
  the 80 px look — the bot got smarter, the level did not get easier.

### Added (previous)

- **runner: a death log, on the contract and on the screen.** `__runnerState.deathLog` is an
  array of `{ x, cause, simMs }` — `cause` is `pit`, `spike` or `enemy` — while `deaths` stays the
  count, so the QA contract that reads `deaths === 0` keeps working. The death overlay prints the
  last one as `x 1211 / pit · 3.9s`, and the goal screen prints it under the death count. "Where
  did the player die" is the number the next level gets designed from, and a memory of it is not
  data. R4 now asserts the log matches the count and names the cause; **R8** wraps
  `CanvasRenderingContext2D.fillText`/`strokeText` before the page loads and reads back every
  string the canvas painted, so the HUD — which `textContent` cannot see — is checked too.
  Proven by injecting `\u2014` into a built HUD string: R8 goes red on `deaths: \u2014 0`.

### Fixed

- **runner's R2 ground check no longer flakes at the start.** Landing once was not enough: the
  start press is held 160 ms and the jump buffer remembers it for 0.12 s, so a second jump could
  fire a few frames after the landing and land inside the measured second (88% on one run, 100%
  on the next, same code). The check now waits for the ground to still hold after the buffer must
  have expired, and keeps the 95% threshold. Three consecutive runs: 100%, 100%, 100%.

- **runner: the first tap now starts the run, wherever it lands.** The title screen said
  "Tap — start" but only the jump pad in the corner started it, so a first-time phone user's
  first move did nothing (#QA, measured on 390×844). The whole title screen is the button now;
  the pad still works, because a tap on the pad is also a tap on the screen.
- **runner: a favicon, and a title that is a title.** `/runner/` shipped no `<link rel="icon">`,
  so the browser asked for `/favicon.ico`, got a 404 and logged an error — the same shape as the
  parry fix. It also shipped `<title>Runner \u2014 Glyph Arena</title>`: HTML has no compiler, so
  the escape reached the tab as text. `examples/runner/index.html` now links
  `public/favicon.svg` and carries a real `—`.
- **the escapes now fail in CI, not in an eye.** `e2e:runner` grew **R6**, on the built files
  rather than the sources: any `\uXXXX` left in `dist/index.html` or `dist/assets/*.js` is red
  (a TypeScript escape compiles to the character; one that survives to the browser is a dash
  somebody meant), `document.title` must be the real string, and the page must link a favicon
  that exists in `dist`. **R7** taps the middle of the 390×844 title screen and requires
  `phase: "play"`. Both were proven against the previously deployed page: R6 fails it on all
  four lines. R2 also learned to wait for the start jump to land before measuring "the ground
  holds while you run" (the spawn frames and the start jump are airborne by design, which made
  a 95% threshold flake between 88% and 100% on identical code).

### Added

- **`pnpm check:deployed --write --pr`** — the deploy record now goes to `main` through a pull
  request, in one command: create the branch, send `docs/bundles.json`, open the PR, wait for
  `verify`, squash-merge, and read `main` back. `main` is protected (PR required, `verify`
  required, admins included) and this container has no git credentials, so the API is the only
  road; doing it by hand is what let a dropped workflow file 404 `/runner/` for half an hour.
  The command is built around the three failures that actually happened, as assertions: the
  branch is read back **before** any file is written (a missing branch makes the file API commit
  to the default branch silently), the PR's `changed_files` must equal the number of files sent,
  and a merge whose `main` did not move is an error. Needs `GITHUB_TOKEN`; without one it says so
  and changes nothing. `--pr --dry-run` prints the plan. `--write` alone still just edits the file
  locally. Covered by `pnpm test:scripts` against a fake GitHub (no token, no network).

### Added

- **`pnpm e2e:runner`** (CI step 9) — the runner slice's acceptance, read from
  `window.__runnerState` rather than from pixels or a stopwatch: ① a second of running
  kills nobody, the ground holds and the camera moves into a world wider than the window,
  ② a death returns you to ground you can stand on within the spec's 0.6 s, with the spike
  (±8 px) and pit (≥60 px back, never into the hole) rules kept apart, ③ the two touch pads
  and the jump pad move you exactly as fast and as high as the keyboard. It also asserts the
  shipped constants still equal the spec (**760 / 2600 / 0.09 / 0.09**) — a relaxed number
  fails there instead of passing quietly — which is how the jump buffer was checked against the spec
  before the spec itself moved: the buffer is 0.12 and the coyote 0.09, so "pressed just before
  landing" is not eaten by the gap between the two.
  Until `examples/runner/dist` exists it reports `PEND` lines and counts them separately
  from passing: pending is not a pass (demo-only; no package API change; no `index-*.js` change)

### Changed

- `examples/parry`: **the first enemy of every run comes from where the player is looking.** The opening
  used to spawn at a fixed angle while the player faced a different way, so the one enemy that has to
  teach "dash into it" arrived behind them. `spawnWave(0)` now takes its angle from the player's facing
  (which starts up, on every run, including a restart); every later wave keeps the scripted angle
  (demo-only; no package API change; `index-*.js` changes)

### Changed

- `examples/parry` is an **endless run** now. The fixed 20-wave script is gone: waves come from
  `waveAt(index)` and never run out, a parry scores **100**, dodging keeps you alive but scores nothing,
  and the run ends on the **third hit** instead of reaching wave 20. Every 30 s the enemies move 10%
  faster and one more arrives at a time (`endless.ts`, capped at 4 at once and 320 px/s). An enemy that
  leaves the arena **wraps to the opposite side** instead of disappearing, so running away never clears
  the field - the old despawn would have made dodging the safe way to play. The HUD leads with
  `Score`, then `Lives`, then `Wave · parried/attempts`; the title carries the one-line purpose.
  `window.__parryState` gains **`score`** and **`attempts`** (demo-only; no package API change;
  `index-*.js` changes)

### Added

- `examples/parry`: the wave table is generated now (`waveAt(index)` / `waveShapeAt(index)`) instead of being
  a fixed 20-row script. The first twenty waves are byte-for-byte the script players learn on; past it the
  same twenty angles turn one step further every lap (so lap two is not lap one memorised) and the speed
  keeps climbing to `MAX_SPEED` 220. Deterministic on purpose - no RNG - so a score can be compared between
  runs. No player-visible change yet; this is the seam an endless run needs (demo-only; no package API
  change; `index-*.js` changes)

### Added

- `examples/parry`: the result screen now shows the session's **best** - most parries, most lives left,
  and the fastest clear - and turns amber when the run that just ended moved one of the three. Each
  record stands on its own, so a slow clear can still hold the parry record and a failed run can still
  hold "most lives left"; the fastest clear is only compared with other clears. `window.__parryState`
  gains **`best`** (`{ parried, lives, clearMs }`, null until a run ends), so an E2E can watch the record
  move (demo-only; no package API change; `index-*.js` changes)

### Fixed

- `examples/parry`: **a run can now end.** An enemy left the field only by being parried, so one that slid
  past the player - or one that hit them - stayed in `enemies` for good. `clear()` needs
  `enemies.length === 0`, so a single miss made the result screen unreachable: the run sat at wave 20 with
  nothing closing in and could be neither won nor lost (measured with `pnpm measure:parry-run`). Enemies now
  leave when they are parried, when they hit the player, or when they leave the play area (40 px of
  margin), and `window.__parryState` gains **`enemyCount`** so an E2E can watch the field drain. A full
  20-wave run is 25 s of game (first contact 7.5 s, one arrival every 0.9 s, the last at 24.6 s)
  (demo-only; no package API change; `index-*.js` changes)

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

- `examples/pickup-demo`: the run is published every frame as **`window.__pickupState`** (`{ phase, ready, worldX, worldY, speed, roundTime }` - the player's world position and measured speed, not a draw call). The E2E read movement out of `hazards[0].x`, which is a hazard that stops against walls, and out of screen coordinates, which the camera pins in place; both made a real measurement look like a pass or a zero. Drawing unchanged (demo-only)

### Added

- `examples/parry`: `window.__parryState` gains **`threats`** - every enemy that will actually reach the player, soonest first, each `{ ms, dirX, dirY }` (the same numbers as `pressMs`/`contactDir` for that enemy). `contactDir` is the first entry. A single direction could only ever answer the nearest enemy, so a harness (or a player watching the HUD) could not defend against two at once; with the list, turning to the next threat is arithmetic (demo-only)

### Fixed

- `examples/parry`: **the game no longer freezes after a parry.** The hitstop branch returned before `scheduleSeconds += delta`, so the clock that the hitstop is measured against never advanced and `scheduleSeconds < hitstopUntil` stayed true for good - one parry and the world stopped. The clock now advances inside the branch; the world still holds still for the 60 ms of the effect (and every multi-parry run, including the acceptance that needs wave 5, was impossible until this) (demo-only)

### Fixed

- `examples/parry`: **`Contact in` no longer counts enemies that will miss.** The candidate was chosen by the projection along an enemy's travel only, so an enemy sliding past a few dozen pixels beside the player read as `Contact in 6ms` while it was really 316 ms away - the HUD said "now" and the state pointed at an enemy a dash could not parry. Candidates now also have to be within `CONTACT_DISTANCE` of the line they travel, so the HUD, `contactMs`, `pressMs` and `contactDir` all describe an enemy that is actually coming. `window.__parryState` also gains **`dashMs`**, so an E2E can press at `pressMs <= windowMs + dashMs` instead of a magic number (demo-only)

### Added

- `examples/parry`: `window.__parryState` now also carries **`contactDirX` / `contactDirY`** (player -> nearest closing enemy, unit vector) and **`pressMs`** (straight-line distance / speed - the number the parry judgement compares with `windowMs`, which is not the same as the HUD's projected `contactMs`). A parry is aimed and timed from those two instead of guessing a direction and a moment (demo-only)

### Added

- `examples/parry`: the run is published every frame as **`window.__parryState`** (`{ phase, parried, lives, wave, contactMs, windowMs }`, read-only, drawing unchanged). The HUD is canvas pixels, so anything that is not a human eye - E2E, the acceptance run - was reduced to guessing from colours, and a hint line in the same amber as the countdown was mistaken for the countdown. Read it with `page.evaluate(() => window.__parryState)` (demo-only)

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

### Added

- **`tilemap`: tiles are text, and the pixel-to-row conversion lives in one place.**
  `createTileMap(text | lines, { legend, cell })`, `mapColumns` / `mapRows`, `tileAt` / `tagsAt` /
  **`hasTag`**, `solidInRect` (half-open), and `surfaceRowBelow(map, xPx, yPx, tag, { maxRows })`.
  The package carries no grid and no vocabulary of its own. Three of its contracts are bugs that
  happened the same day: **pixels in** (`bottom / cell` rounded down and read one row too far),
  **half-open** rects (so the caller's `-0.001` disappears), and tags read through `hasTag`
  (`=== "solid"` breaks the moment a tile carries two tags). Numeric gate: with comments stripped
  the only literals allowed are `0` and `1`.

- **`draw` can make a screen with no images.** `rect({ x, y, w, h, fill?, stroke?, lineWidth?,
  radius? })`, `text({ text, x, y, size, font?, fill?, align?, baseline?, maxWidth? })`,
  `measureText({ text, size, font? })`, `setView(matrix | null)`. Until now `draw` had `clear` and
  `sprite`, and `sprite` needs an image, so all three examples called `ctx.fillRect` / `fillText` /
  `roundRect` themselves: the first place every game goes was the one place the library did nothing.
  `radius` is an option on `rect` and not a second function (the samples' `roundRect` is a
  rectangle), with a hand-built `arcTo` path where `roundRect` is missing. `y` in `text` is the
  **top** by default, because canvas' own default is `alphabetic` and shifts every line down on
  someone else's screen. With neither `fill` nor `stroke`, `rect` draws **nothing** instead of
  throwing — this runs every frame, and a throw there stops the game rather than reporting a
  mistake. `setView(null)` comes back to screen coordinates so a HUD can sit outside the camera;
  `ctx.setTransform` appeared in no document and was the missing piece of the 30-minute path.
  **Measured in a browser (Chromium 156): a 320x240 page drawn with `rect` and `text` alone, no
  image files at all, has 6365 non-transparent pixels; with `view(e=-50,f=-20)` a red rect lands at
  (55,85) and (105,105) is transparent** — the check reads pixels, not "was it called".

### Fixed

- **two more hand-kept lists are derived now.** The umbrella test wrote out 18 export names, so every
  new module turned it red; it reads `packages/` and compares against the modules' own exports.
  `smoke:pack-install`'s consumer was a hand-written import list, so the tarball side passed while
  the importing side broke the day `tilemap` landed; the consumer is generated from the tarballs.

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
