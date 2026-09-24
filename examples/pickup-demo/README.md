# Pickup Demo

Top-down pickup game sample for [Glyph Arena](https://github.com/Fogrexon/glyph-arena). Collect gems, avoid walls, and watch the camera follow the player.

## Packages used

| Package | Role |
|---------|------|
| `@fogrexon/glyph-arena-loop` | Frame loop via `createLoop` |
| `@fogrexon/glyph-arena-input` | `attach` / `snapshot` — keys fed into `actions.tick` |
| `@fogrexon/glyph-arena-actions` | Arrow bindings; keyboard movement from `down` first |
| `@fogrexon/glyph-arena-gamepad` | `snapshot` pads[0]; stick axes + d-pad OR’d after keyboard |
| `@fogrexon/glyph-arena-assets` | `loadImage` for sprites, `loadBytes` for pickup SE |
| `@fogrexon/glyph-arena-audio` | `decode` + `play` on pickup; `stop` when pausing mid-SE; `resume` on first input |
| `@fogrexon/glyph-arena-ecs` | Entity position/AABB/kind; demo maps entities to scene nodes |
| `@fogrexon/glyph-arena-draw` | `clear` / `sprite` via `createDraw` |
| `@fogrexon/glyph-arena-scene` | `createForest` hierarchy: `field` under root; walls/gems parented to `field`; player under root |
| `@fogrexon/glyph-arena-transform` | Local TRS + `world(node, forest.parent)` chains parent transforms for drawing |
| `@fogrexon/glyph-arena-camera` | `set({ x, y, zoom })` — follow player; demo `baseZoom` when no pickup tween |
| `@fogrexon/glyph-arena-collide` | AABB `overlaps` for walls and pickups |
| `@fogrexon/glyph-arena-timer` | Gem respawn delay; `every(0.4)` idle pulse on uncollected gems |
| `@fogrexon/glyph-arena-tween` | Camera zoom on pickup; gem scale-out FX after reparent to player |

Sprites and sound ship under `public/` (`player.png`, `gem.png`, `wall.png`, `pickup.wav`). If `loadImage` fails, the demo falls back to color-rect canvases. Score is drawn with canvas `fillText` (no DOM HUD).

On pickup, the gem is reparented under the player at a fixed local offset (`y: -24`), scaled down with `tween.to(1, 0, 0.2)` while following the player via `transform.world`. ECS despawn and scene destroy happen only after the tween completes; respawn is scheduled from that destroy frame.

Uncollected gems pulse idle scale between `1` and `1.12` via `timer.every(0.4)` (target scale toggled each tick, applied with `transform.set` after position sync — no stacked tweens). The idle handle is cancelled on pickup or restart.

Press **R** to restart: cancels in-flight tweens/timers, cleans up mid-FX gems parented to the player, despawns field entities, destroys and recreates the `field` subtree with the initial layout, resets the player to center, score to `0`, demo `baseZoom` and camera zoom to `1`. Restart always clears pause and wins over **P** and zoom on the same frame.

Press **P** to toggle pause (keyboard only, edge-triggered via `actions.pressed("pause")`). The loop keeps running; simulation (`timer`/`tween` tick, movement, collide, pickup) is skipped while paused, but input/gamepad snapshots and `actions.tick` still run so **P**, **R**, and zoom keys work. If **P** and **R** land on the same frame, restart runs first and pause does not toggle. While paused, the last frame is redrawn with a **PAUSED** HUD label; idle/respawn schedules freeze and resume after unpause. Entering pause stops a playing pickup SE via `audio.stop` on the demo-held handle. Keyboard **=** / **+**, **-**, and **0** adjust demo `baseZoom` (clamped `0.5`–`2`, step `0.1`; reset to `1`) even while paused; pickup zoom tweens still use the `baseZoom` at tween start for peak scale and snap to current `baseZoom` on complete.

## Run locally

From the repo root:

```bash
pnpm install
pnpm build
pnpm --filter @fogrexon/glyph-arena-pickup-demo dev
```

Or from this directory:

```bash
pnpm dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Controls

- **Arrow keys** — move the player (via `actions`)
- **=** / **+** (main or numpad) — zoom in (`actions.pressed("zoomIn")`, edge-triggered; keyboard only)
- **-** (main or numpad) — zoom out (`actions.pressed("zoomOut")`)
- **0** (main or numpad) — reset zoom to `1` (`actions.pressed("zoomReset")`; wins over in/out on the same frame; in+out together apply neither)
- **P** — pause / unpause (`actions.pressed("pause")`, edge-triggered; keyboard only)
- **R** — restart the level (`actions.pressed("restart")`, edge-triggered; wins over **P** and zoom on the same frame)
- **Gamepad** — left stick + d-pad on pad 0, OR’d after keyboard; deadzone `0.25` is demo-local (no zoom on gamepad)

Audio resumes on the first key press or gamepad input (not on load).

## Build

```bash
pnpm build
```

Output goes to `dist/` (static assets from `public/` are copied through).

## GitHub Pages

After merge to `main`, the [Deploy pickup demo to GitHub Pages](../../.github/workflows/demo-pages.yml) workflow builds this demo (with `base: /glyph-arena/`) and publishes `examples/pickup-demo/dist` to GitHub Pages.

- **URL:** https://fogrexon.github.io/glyph-arena/
- **Setup:** Repository Settings → Pages → Source: **GitHub Actions** (one-time, if not already enabled).

To preview the Pages asset paths locally:

```bash
pnpm build:pages
pnpm preview
```
