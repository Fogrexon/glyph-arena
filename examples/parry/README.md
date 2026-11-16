# Parry Demo

Second sample for Glyph Arena. Enemies converge from a fixed script; **dash into one** and it is
parried. Each parry lands with a hitstop, a camera shake and a `Last parry: Nms early` readout — the
window starts at 200 ms and narrows to 120 ms as the run goes on.

**Flow:** title -> **Space** (or tap) -> play -> **FAIL** (lives run out) or **CLEAR** (survive all 20
waves) -> **R** restart. Nothing is randomised: wave *n* of a page load is always the same wave.

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
