# Loop + Input Demo

Minimal browser demo that combines only:

- `@fogrexon/glyph-arena-loop` — game loop via `createLoop`
- `@fogrexon/glyph-arena-input` — keyboard/pointer via `createInput`

Rendering is raw 2D canvas (no renderer package).

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

- **WASD** or **arrow keys** — move the circle
- **Pointer** (mouse/touch) — circle follows the active pointer when no keys are held

## Build

```bash
pnpm build
```

Output goes to `dist/`.
