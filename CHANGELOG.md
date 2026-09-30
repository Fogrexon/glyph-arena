# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
