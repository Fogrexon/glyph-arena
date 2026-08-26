# Contributing

## Setup

```bash
pnpm install
```

## Commands

```bash
pnpm typecheck   # TypeScript across all packages
pnpm test        # Node test runner
pnpm build       # Compile all packages
```

## Repository layout

Packages live under `packages/`. Each package is a standalone workspace member with its own `package.json`, `src/`, and `test/`.

## Package boundaries

- Do **not** add runtime dependencies unless explicitly required.
- Do **not** import the other first-party package (`glyph-arena-loop` and `glyph-arena-input` are independent).

## API documentation

- [glyph-arena-actions API](docs/api-actions.md)
- [glyph-arena-assets API](docs/api-assets.md)
- [glyph-arena-audio API](docs/api-audio.md)
- [glyph-arena-collide API](docs/api-collide.md)
- [glyph-arena-draw API](docs/api-draw.md)
- [glyph-arena-ecs API](docs/api-ecs.md)
- [glyph-arena-gamepad API](docs/api-gamepad.md)
- [glyph-arena-input API](docs/api-input.md)
- [glyph-arena-loop API](docs/api-loop.md)
- [glyph-arena-scene API](docs/api-scene.md)
- [glyph-arena-timer API](docs/api-timer.md)
