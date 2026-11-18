# Changelog

All notable changes to this project will be documented in this file.

Release tags are cut only when the shipped demo bundle (`index-*.js`) changes. Documentation-only changes (`docs/`, `README.md`) update the published site without a new tag. The tag is also the npm version: `@fogrexon/glyph-arena` is published at the version the tag names (`pnpm publish:npm --publish`), so the two are always the same number.

## [Unreleased]

### Changed

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
