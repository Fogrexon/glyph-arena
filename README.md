# Glyph Arena

Small TypeScript building blocks for 2D browser games. Each package is an independent workspace member with **no runtime dependencies**, so a game composes only the pieces it needs.

The workspace has 15 packages: the 14 modules below, plus `@fogrexon/glyph-arena`, which bundles them into a single ESM build. Nothing is on npm yet; inside this repository the modules are consumed through `workspace:*`.

## Which name to import

Only **`@fogrexon/glyph-arena`** is meant for consumers. It bundles the 14 modules and re-exports their value exports flat, so a game imports one name instead of fourteen ([API page](docs/api-glyph-arena.md)).

The `@fogrexon/glyph-arena-*` names in the table below are workspace-internal: they are not published on their own, so importing them from outside this repository will not resolve.

## Packages

| Package | What it does | API |
| --- | --- | --- |
| `@fogrexon/glyph-arena-actions` | Action bindings from keyboard codes | [api](docs/api-actions.md) |
| `@fogrexon/glyph-arena-assets` | URL asset loading with in-memory cache | [api](docs/api-assets.md) |
| `@fogrexon/glyph-arena-audio` | Web Audio playback helper | [api](docs/api-audio.md) |
| `@fogrexon/glyph-arena-camera` | 2D camera state and world-to-screen view matrix | [api](docs/api-camera.md) |
| `@fogrexon/glyph-arena-collide` | Axis-aligned bounding box overlap test | [api](docs/api-collide.md) |
| `@fogrexon/glyph-arena-draw` | Minimal 2D canvas drawing helpers | [api](docs/api-draw.md) |
| `@fogrexon/glyph-arena-ecs` | Minimal entity-component storage | [api](docs/api-ecs.md) |
| `@fogrexon/glyph-arena-gamepad` | Gamepad state snapshot reader | [api](docs/api-gamepad.md) |
| `@fogrexon/glyph-arena-input` | Keyboard and pointer input snapshot from an `EventTarget` | [api](docs/api-input.md) |
| `@fogrexon/glyph-arena-loop` | Injectable frame loop | [api](docs/api-loop.md) |
| `@fogrexon/glyph-arena-scene` | Hierarchical scene graph nodes | [api](docs/api-scene.md) |
| `@fogrexon/glyph-arena-timer` | Tick-driven timer scheduling | [api](docs/api-timer.md) |
| `@fogrexon/glyph-arena-transform` | Per-node local 2D transforms and world matrix composition | [api](docs/api-transform.md) |
| `@fogrexon/glyph-arena-tween` | Tick-driven scalar tweening | [api](docs/api-tween.md) |

## Putting it together

```ts
import { createWorld, createLoop } from "@fogrexon/glyph-arena";

const world = createWorld();

const entity = world.spawn();
world.set(entity, "stats", { hp: 10 });

const loop = createLoop({
  onFrame(time) {
    // `time` is the tick time reported by the injected clock.
  },
});

loop.start();
```

Each package's API doc (`docs/api-*.md`) lists its exports, options and edge cases; each package also has a `README.md` under `packages/`. The same pages are rendered to HTML and published at [fogrexon.github.io/glyph-arena/docs](https://fogrexon.github.io/glyph-arena/docs/).

## Demo

A top-down pickup game runs at [fogrexon.github.io/glyph-arena](https://fogrexon.github.io/glyph-arena/). The source is `examples/pickup-demo`.

```bash
pnpm install
pnpm build
pnpm --filter @fogrexon/glyph-arena-pickup-demo dev
```

`pnpm build` is not optional here: the demo resolves `@fogrexon/glyph-arena-*` through each package's `dist`, so starting the dev server before the packages are built fails to resolve them.

## Development

```bash
pnpm install
pnpm typecheck                   # no build needed: tsconfig `paths` maps packages to their src
pnpm build                       # required: dist is what npm, Pages and the gates below read
pnpm check:package-entry-points  # package.json entry points must exist
pnpm typecheck:public-api        # emitted declarations must keep the public API
pnpm smoke:pack-install          # pack, install offline, import + strict tsc
pnpm test
```

CI (`.github/workflows/ci.yml`) runs the same gates in this order:

```
install → typecheck → build → check:package-entry-points → typecheck:public-api → smoke:pack-install → test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the definition of done and the repository layout.

## Repository layout

- `packages/` — the 14 modules plus the `@fogrexon/glyph-arena` umbrella, each with `src/`, `test/` and a `README.md`
- `examples/` — `pickup-demo`, the demo above
- `docs/` — `api-*.md`, one per package
- `fixtures/public-api/` — type-only fixture that imports every package by name and checks the emitted declarations
- `scripts/` — repository checks such as `check-package-entry-points.mjs` and `smoke-pack-install.mjs`
