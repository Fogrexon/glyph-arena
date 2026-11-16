# @fogrexon/glyph-arena

The whole [Glyph Arena](https://github.com/Fogrexon/glyph-arena) 2D game runtime
in one package.

Glyph Arena is built as 14 small modules with no runtime dependencies (ECS,
frame loop, timer, tween, input, gamepad, camera, transforms, drawing, assets,
audio, actions, collision, scene graph). Those modules stay workspace-internal;
this package bundles all of them into a single ESM build with self-contained
type declarations, so a game depends on one name instead of fourteen.

## Install

```sh
npm install @fogrexon/glyph-arena
```

## Usage

```ts
import { createWorld, createLoop, createTimer, createDraw } from "@fogrexon/glyph-arena";
```

Every value export of the modules is re-exported flat, so names are imported
exactly as the module docs describe them:

| Export | Module |
| --- | --- |
| `createActions` | actions |
| `createAssets` | assets |
| `createAudio` | audio |
| `createCamera` | camera |
| `overlaps` | collide |
| `createDraw` | draw |
| `createWorld` | ecs |
| `createGamepad` | gamepad |
| `createInput` | input |
| `createLoop` | loop |
| `createForest` | scene |
| `createTimer` | timer |
| `createTransform` | transform |
| `createTween` | tween |

`Matrix2D` is declared by both `camera` and `transform` with the same shape; the
umbrella re-exports the `transform` declaration explicitly, because two star
exports of one name are ambiguous for the type declaration build.

## Which entry points exist

- `import` resolves to `dist/index.js` (ESM)
- types resolve to `dist/index.d.ts`

ESM only, like the 14 modules: a CommonJS build would need a separate
`dist/index.d.cts`, and one `types` shared by `import` and `require` is the
masquerading trap for `NodeNext` consumers.

`sideEffects` is `false`: nothing in the runtime runs at import time, every
module is a factory, so unused modules are dropped by the consumer's bundler.

## Building (repo contributors)

```sh
pnpm --filter @fogrexon/glyph-arena build
```

The build runs vite's library mode (ESM), then `tsc -p tsconfig.build.json`
for the declaration tree, then `scripts/write-entry-dts.mjs` writes the
`dist/index.d.ts` entry that re-exports it.
