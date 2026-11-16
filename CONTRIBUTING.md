# Contributing

## Setup

```bash
pnpm install
```

## Commands

```bash
pnpm typecheck   # TypeScript across all packages and examples; no build needed
pnpm test        # Node test runner
pnpm build       # Compile all packages
```

Three further gates need a `pnpm build` first:

```bash
pnpm check:package-entry-points  # package.json entry points must exist
pnpm typecheck:public-api        # emitted declarations must keep the public API
pnpm smoke:pack-install          # pack, install offline, import + strict tsc
```

## Definition of done

A change is done only when all three pass on the same commit:

1. `pnpm typecheck` — no TypeScript errors in any package or example (`examples/` included), with no prior build
2. `pnpm test` — the Node test runner passes for every package
3. `pnpm build` — every package and example builds

`pnpm typecheck` does not depend on a previous build: `tsconfig.base.json` maps `@fogrexon/glyph-arena-*` to `packages/*/src/index.ts`, so a fresh clone typechecks as it is. `pnpm build` is still required — it produces `dist`, which is what npm consumers, the deployed demo and the three gates below read.

**A green `build` alone is not done.** The example build is `vite build`, which strips types without checking them: a type error under `examples/` still builds, and only `pnpm typecheck` catches it. `pnpm build` runs no tests either, so a build-only run says nothing about the other two points.

Merge only when typecheck, test and build are all green on the same commit, together with the gates CI runs before and after them, and paste the CI run URL in the PR description so the green can be checked. CI runs:

```
install → typecheck → build → check:package-entry-points → typecheck:public-api → smoke:pack-install → test
```

- `check:package-entry-points` — every `main` / `types` / `exports` entry in a package points at a file that exists.
- `typecheck:public-api` — a type-only fixture imports all 14 packages by name and checks the emitted declarations.
- `smoke:pack-install` — `pnpm pack` builds tarballs, installs them into an empty project offline, then imports them and typechecks a strict consumer. It never touches the registry.

When a change affects the deployed demo, also confirm it on the live URL before calling it done. Merged but not live is not done.

## Repository layout

Packages live under `packages/`. Each package is a standalone workspace member with its own `package.json`, `src/`, and `test/`.

Examples live under `examples/`. The pickup sample is at `examples/pickup-demo`; the live internal demo is at https://fogrexon.github.io/glyph-arena/.

## Package boundaries

- Do **not** add runtime dependencies unless explicitly required.
- Do **not** import the other first-party package (`glyph-arena-loop` and `glyph-arena-input` are independent).

## What ships to npm

Only one package is published: `@fogrexon/glyph-arena`. It bundles the 14 modules into a single ESM build and re-exports their value exports flat with self-contained type declarations. The 14 `@fogrexon/glyph-arena-*` modules stay workspace-internal and are never published on their own, so nothing outside this repository can install them by name.

- **Adding or renaming a module** means adding it to `packages/glyph-arena/src/index.ts` (relative `export *`) and to `fixtures/public-api/index.mts`. Skip either and `pnpm -r typecheck` stays green while the published package is missing the export.
- **The emitted declarations must stay self-contained**: no bare `@fogrexon/*` specifiers inside `dist/`. `pnpm typecheck:public-api` and `pnpm smoke:pack-install` check this.
- **The version lives on the umbrella** (`packages/glyph-arena/package.json`); the 14 subpackage versions are internal values.
- A module that runs code at import time would break `sideEffects: false` in the umbrella — keep every module a factory.

## API documentation

These files are rendered to HTML by `scripts/render-docs.mjs` during the demo build and published at [fogrexon.github.io/glyph-arena/docs](https://fogrexon.github.io/glyph-arena/docs/). Edit the `docs/api-*.md` sources, not the generated pages.

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
