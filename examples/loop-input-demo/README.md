# Loop + Input Demo

Minimal browser demo that combines:

- `@fogrexon/glyph-arena-loop` — game loop via `createLoop`
- `@fogrexon/glyph-arena-input` — keyboard/pointer via `createInput`
- `@fogrexon/glyph-arena-actions` — keyboard bindings via `createActions`
- `@fogrexon/glyph-arena-draw` — canvas drawing via `createDraw`

Circle sprites are prepared once at startup; each frame uses only `draw.clear()` and `draw.sprite()`.

## Run locally

From the repo root:

```bash
pnpm install
pnpm build
pnpm --filter @fogrexon/glyph-arena-loop-input-demo dev
```

Or from this directory:

```bash
pnpm dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Controls

- **WASD** or **arrow keys** — move the circle (bound through actions: `left`, `right`, `up`, `down`)
- **Pointer** (mouse/touch) — circle follows the active pointer when no movement keys are held

## Build

```bash
pnpm build
```

Output goes to `dist/`.

## GitHub Pages

After merge to `main`, the [Deploy loop-input demo to GitHub Pages](../../.github/workflows/demo-pages.yml) workflow builds this demo (with `base: /glyph-arena/`) and publishes `examples/loop-input-demo/dist` to GitHub Pages.

- **URL:** https://fogrexon.github.io/glyph-arena/
- **Setup:** Repository Settings → Pages → Source: **GitHub Actions** (one-time, if not already enabled).

To preview the Pages asset paths locally:

```bash
pnpm build:pages
pnpm preview
```
