# Contributing

## Setup

```bash
pnpm install
```

## Commands

```bash
pnpm typecheck   # TypeScript across all packages and examples
pnpm test        # Node test runner
pnpm build       # Compile all packages
```

## Definition of done

A change is done only when all three pass on the same commit:

1. `pnpm typecheck` — no TypeScript errors in any package or example (`examples/` included)
2. `pnpm test` — the Node test runner passes for every package
3. `pnpm build` — every package and example builds

**A green `build` alone is not done.** The example build is `vite build`, which strips types without checking them: a type error under `examples/` still builds, and only `pnpm typecheck` catches it. `pnpm build` runs no tests either, so a build-only run says nothing about the other two points.

Merge only when typecheck, test and build are all green on the same commit, and paste the CI run URL in the PR description so the green can be checked.

When a change affects the deployed demo, also confirm it on the live URL before calling it done. Merged but not live is not done.

## Repository layout

Packages live under `packages/`. Each package is a standalone workspace member with its own `package.json`, `src/`, and `test/`.

Examples live under `examples/`. The pickup sample is at `examples/pickup-demo`; the live internal demo is at https://fogrexon.github.io/glyph-arena/.

## Package boundaries

- Do **not** add runtime dependencies unless explicitly required.
- Do **not** import the other first-party package (`glyph-arena-loop` and `glyph-arena-input` are independent).

## API documentation

- [glyph-arena-actions API](docs/api-actions.md)
- [glyph-arena-assets API](docs/api-assets.md)
- [glyph-arena-audio API](docs/api-audio.md)
- [glyph-arena-camera API](docs/api-camera.md)
- [glyph-arena-collide API](docs/api-collide.md)
- [glyph-arena-draw API](docs/api-draw.md)
- [glyph-arena-ecs API](docs/api-ecs.md)
- [glyph-arena-gamepad API](docs/api-gamepad.md)
- [glyph-arena-input API](docs/api-input.md)
- [glyph-arena-loop API](docs/api-loop.md)
- [glyph-arena-scene API](docs/api-scene.md)
- [glyph-arena-timer API](docs/api-timer.md)
- [glyph-arena-tween API](docs/api-tween.md)
- [glyph-arena-transform API](docs/api-transform.md)
