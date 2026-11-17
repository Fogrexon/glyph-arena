# @fogrexon/glyph-arena

The whole Glyph Arena 2D game runtime in one package.

Glyph Arena is built as small modules with no runtime dependencies (ECS, frame loop, timer, tween, input, gamepad, camera, body, tile maps, transforms, drawing, assets, audio, actions, collision, scene graph). Those modules stay internal to this repository; this package bundles all of them into a single ESM build with self-contained type declarations, so a game depends on one name instead of one per module.

## Availability

Version `0.2.0`. **Not published to npm yet** — the first publish is pending. The `@fogrexon/glyph-arena-*` modules are workspace-internal and are not published separately, so nothing outside this repository can install them by name.

## Usage

Every value export of those modules is re-exported flat, so a consumer writes one import instead of one per module:

```ts
import { createWorld, createLoop, createTimer, createDraw } from "@fogrexon/glyph-arena";
```

Names are imported exactly as the per-module pages in this documentation describe them.

## Exports

Generated from `packages/` when the docs are built — do not edit this table by hand. Type-only names
are in the emitted declarations rather than in this table.

## Entry points

- `import` resolves to `dist/index.js` (ESM)
- types resolve to `dist/index.d.ts`

ESM only, like the modules it bundles: a CommonJS build would need a separate `dist/index.d.cts`, and one `types` field shared by `import` and `require` is a masquerading trap for `NodeNext` consumers.

`sideEffects` is `false`: every module is a factory and nothing runs at import time, so a consumer's bundler can drop the modules a game does not use.

## Type declarations

The emitted declaration tree is self-contained under `dist/`: its module specifiers are relative, so no declaration refers to a workspace name. `Matrix2D` is declared by both `camera` and `transform` with the same shape; the umbrella re-exports the `transform` declaration explicitly, because two star exports of one name are ambiguous for the declaration build.

## License

MIT.
