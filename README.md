# Glyph Arena

Small TypeScript building blocks for 2D browser games. **New here? [Build a game in 30 minutes](docs/tutorial.md)** goes from an empty folder to something you can play, with no assets. Each package is an independent workspace member with **no runtime dependencies**, so a game composes only the pieces it needs.

Each module below is a separate workspace member; `@fogrexon/glyph-arena` bundles all of them into a single ESM build. Inside this repository the modules are consumed through `workspace:*`.

## Play it

Four samples and the API docs, published from this repository — open the links, nothing to install:

| Sample | What it is | Source |
| --- | --- | --- |
| [Pickup](https://fogrexon.github.io/glyph-arena/) | Top-down collection: 8 gems in 60 s, three lives | `examples/pickup-demo` |
| [Camp](https://fogrexon.github.io/glyph-arena/camp/) | A side-on duel in two rooms: three verbs, and enemies that take turns | `examples/camp` |
| [Parry](https://fogrexon.github.io/glyph-arena/parry/) | Dash into an enemy to parry it; 20 waves from a fixed script | `examples/parry` |
| [Runner](https://fogrexon.github.io/glyph-arena/runner/) | Side-scrolling platformer: three levels, no randomness | `examples/runner` |
| [API Docs](https://fogrexon.github.io/glyph-arena/docs/) | One page per package, and the front page this README becomes | `docs/` |

Every row is checked against the deployment: each example declares its own page in `package.json`
(`glyphArenaPage`), `assemble-site.mjs` publishes exactly those, and `scripts/demo-links.test.mjs`
fails when the table and the declarations disagree in either direction.

## Which name to import

Only **`@fogrexon/glyph-arena`** is meant for consumers. It bundles every module and re-exports their value exports flat, so a game imports one name instead of one per module ([API page](docs/api-glyph-arena.md)).

The `@fogrexon/glyph-arena-*` names are workspace-internal: they are not published on their own, so importing them from outside this repository will not resolve.

## Packages

The modules, what each one does, and a link to its page are on the
[docs front page](https://fogrexon.github.io/glyph-arena/docs/) — that table is generated from
`packages/` when the docs are built, so it cannot go stale.

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

## Running a sample locally

Each page in the table above is a Vite build of one directory under `examples/`. For the pickup sample:

```bash
pnpm install
pnpm build
pnpm --filter @fogrexon/glyph-arena-pickup-demo dev
```

`pnpm build` is not optional here: a sample resolves `@fogrexon/glyph-arena-*` through each package's `dist`, so starting the dev server before the packages are built fails to resolve them. The other samples use the same command with their own package name (`@fogrexon/glyph-arena-camp-demo`, `-parry-demo`, `-runner-demo`).

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

- `packages/` — the modules plus the `@fogrexon/glyph-arena` umbrella, each with `src/`, `test/` and a `README.md`
- `examples/` — the four samples in the table above: `pickup-demo`, `camp`, `parry`, `runner`
- `docs/` — `api-*.md`, one per package
- `fixtures/public-api/` — type-only fixture that imports every package by name and checks the emitted declarations
- `scripts/` — repository checks such as `check-package-entry-points.mjs` and `smoke-pack-install.mjs`
