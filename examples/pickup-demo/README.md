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
| `@fogrexon/glyph-arena-audio` | `decode` + `play` on pickup; `resume` on first input |
| `@fogrexon/glyph-arena-ecs` | Entity position/AABB/kind; demo maps entities to scene nodes |
| `@fogrexon/glyph-arena-draw` | `clear` / `sprite` via `createDraw` |
| `@fogrexon/glyph-arena-scene` | `createForest` nodes for player, walls, gems |
| `@fogrexon/glyph-arena-transform` | Local TRS + `world(node, forest.parent)` |
| `@fogrexon/glyph-arena-camera` | `set({ x, y })` each frame to follow player |
| `@fogrexon/glyph-arena-collide` | AABB `overlaps` for walls and pickups |
| `@fogrexon/glyph-arena-timer` | Gem respawn delay |
| `@fogrexon/glyph-arena-tween` | Brief zoom on pickup |

Sprites and sound ship under `public/` (`player.png`, `gem.png`, `wall.png`, `pickup.wav`). If `loadImage` fails, the demo falls back to color-rect canvases. Score is drawn with canvas `fillText` (no DOM HUD).

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
- **Gamepad** — left stick + d-pad on pad 0, OR’d after keyboard; deadzone `0.25` is demo-local

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
