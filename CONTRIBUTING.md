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

- [glyph-arena-loop API](docs/api-loop.md)
- [glyph-arena-input API](docs/api-input.md)
