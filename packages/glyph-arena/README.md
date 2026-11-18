# @fogrexon/glyph-arena

The whole [Glyph Arena](https://github.com/Fogrexon/glyph-arena) 2D game runtime in one package: one
import, no runtime dependencies, and a screen you can draw without loading a single image.

## Rectangles and text, with nothing to fetch

```ts
import { createDraw, createLoop } from "@fogrexon/glyph-arena";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const draw = createDraw({ context: canvas.getContext("2d")! });

createLoop({
  onFrame: ({ elapsed }) => {
    draw.clear("#0d1626");
    draw.rect({ x: 40 + Math.sin(elapsed) * 60, y: 120, w: 60, h: 60, fill: "#f7b32b" });
    draw.text({ text: `t ${elapsed.toFixed(1)}s`, x: 16, y: 16, size: 16, fill: "#e8eaed" });
  },
}).start();
```

That is the whole loop: no images, no sprite sheet, no asset loader in the way. When the rectangle
should walk and jump instead of sliding, add a tile map (`createTileMap`), a body
(`createBody` / `stepBody`) and a camera (`createCamera`) — the modules are re-exported flat, so they
come from the same import.

## Install

```sh
npm install @fogrexon/glyph-arena
```

## What is inside

Every workspace module is bundled into this package and its value exports are re-exported flat, so a
game writes one import instead of one per module: actions, assets, audio, body, camera, chase, collide, draw,
ecs, gamepad, input, loop, scene, tilemap, timer, touch, transform, tween. The docs site lists each one's
exports, and **the umbrella's export table is generated from the sources when the docs are built** — it
is not a table typed here that goes stale the day a module is added.

- Docs: <https://fogrexon.github.io/glyph-arena/docs/>
- One game in 30 minutes: <https://fogrexon.github.io/glyph-arena/docs/tutorial.html>

`Matrix2D` is declared by both `camera` and `transform` with the same shape; the umbrella re-exports
the `transform` declaration explicitly, because two star exports of one name are ambiguous for the
type declaration build.

## Which entry points exist

- `import` resolves to `dist/index.js` (ESM)
- types resolve to `dist/index.d.ts`

ESM only: a CommonJS build would need a separate `dist/index.d.cts`, and one `types` field shared by
`import` and `require` is the masquerading trap for `NodeNext` consumers.

`sideEffects` is `false`: nothing in the runtime runs at import time, every module is a factory, so
unused modules are dropped by the consumer's bundler.

## Building (repo contributors)

```sh
pnpm --filter @fogrexon/glyph-arena build
```

The build runs vite's library mode (ESM), then `tsc -p tsconfig.build.json` for the declaration tree,
then `scripts/write-entry-dts.mjs` writes the `dist/index.d.ts` entry that re-exports it. `prepack`
runs the build too, so `pnpm pack` from a fresh checkout ships a `dist/` instead of an empty tarball.

## License

MIT.
