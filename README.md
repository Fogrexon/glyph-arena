# Glyph Arena

Small TypeScript building blocks for 2D browser games. Each package is an independent workspace member with **no runtime dependencies**, so a game composes only the pieces it needs.

The packages are version `0.1.0` and are **not published to npm yet**. Use them from this monorepo (`workspace:*`).

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
import { createWorld } from "@fogrexon/glyph-arena-ecs";
import { createLoop } from "@fogrexon/glyph-arena-loop";

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

Each package's API doc (`docs/api-*.md`) lists its exports, options and edge cases; each package also has a `README.md` under `packages/`.

## Demo

A top-down pickup game runs at [fogrexon.github.io/glyph-arena](https://fogrexon.github.io/glyph-arena/). The source is `examples/pickup-demo`.

```bash
pnpm install
pnpm build
pnpm --filter @fogrexon/glyph-arena-pickup-demo dev
```

## Development

```bash
pnpm install
pnpm build                       # first: packages import each other through dist/*.d.ts
pnpm typecheck
pnpm test
pnpm check:package-entry-points  # after build: package.json entry points must exist
pnpm typecheck:public-api        # after build: emitted declarations must keep the public API
```

CI (`.github/workflows/ci.yml`) runs the same gates in this order:

```
install → build → check:package-entry-points → typecheck:public-api → typecheck → test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the definition of done and the repository layout.

## Repository layout

- `packages/` — the 14 packages, each with `src/`, `test/` and a `README.md`
- `examples/` — `pickup-demo`, the demo above
- `docs/` — `api-*.md`, one per package
- `fixtures/public-api/` — type-only fixture that imports every package by name and checks the emitted declarations
- `scripts/` — repository checks such as `check-package-entry-points.mjs`
