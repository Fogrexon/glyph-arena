# Pickup Demo

Top-down pickup game sample for [Glyph Arena](https://github.com/Fogrexon/glyph-arena). Collect gems, avoid walls, and watch the camera follow the player.

## Packages used

| Package | Role |
|---------|------|
| `@fogrexon/glyph-arena-loop` | Frame loop via `createLoop` |
| `@fogrexon/glyph-arena-input` | `attach` / `snapshot` — keys only, fed into `actions.tick` |
| `@fogrexon/glyph-arena-actions` | Arrow bindings; movement from `down` only |
| `@fogrexon/glyph-arena-draw` | `clear` / `sprite` via `createDraw` |
| `@fogrexon/glyph-arena-scene` | `createForest` nodes for player, walls, items |
| `@fogrexon/glyph-arena-transform` | Local TRS + `world(node, forest.parent)` |
| `@fogrexon/glyph-arena-camera` | `set({ x, y })` each frame to follow player |
| `@fogrexon/glyph-arena-collide` | AABB `overlaps` for walls and pickups |
| `@fogrexon/glyph-arena-timer` | Item respawn delay |
| `@fogrexon/glyph-arena-tween` | Brief zoom on pickup |

Sprites are generated at startup with offscreen canvases. Score is drawn with canvas `fillText` (no DOM HUD).

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

- **Arrow keys** — move the player

## Build

```bash
pnpm build
```

Output goes to `dist/`.

## GitHub Pages

After merge to `main`, the [Deploy pickup demo to GitHub Pages](../../.github/workflows/demo-pages.yml) workflow builds this demo (with `base: /glyph-arena/`) and publishes `examples/pickup-demo/dist` to GitHub Pages.

- **URL:** https://fogrexon.github.io/glyph-arena/
- **Setup:** Repository Settings → Pages → Source: **GitHub Actions** (one-time, if not already enabled).

To preview the Pages asset paths locally:

```bash
pnpm build:pages
pnpm preview
```
