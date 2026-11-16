/**
 * `@fogrexon/glyph-arena` — the whole runtime in one package.
 *
 * This is the package intended for npm. It bundles the 14 workspace modules
 * (which stay internal to this repo) and re-exports their public API flat, so a
 * consumer writes one import instead of one per module:
 *
 * ```ts
 * import { createWorld, createLoop, createTimer } from "@fogrexon/glyph-arena";
 * ```
 *
 * ## Why the specifiers are relative
 *
 * `tsc` copies module specifiers into the emitted `.d.ts` verbatim, and the 14
 * modules are **not** published on their own. Writing `export * from
 * "@fogrexon/glyph-arena-ecs"` here would therefore publish declarations that
 * no consumer can resolve (the name would exist only in this monorepo). Relative
 * paths keep the emitted declaration tree self-contained under `dist/`, and the
 * bundler inlines the same sources into `dist/index.js` / `dist/index.cjs`, so
 * the published package has no `dependencies`.
 */
export * from "../../glyph-arena-actions/src/index.js";
export * from "../../glyph-arena-assets/src/index.js";
export * from "../../glyph-arena-audio/src/index.js";
export * from "../../glyph-arena-camera/src/index.js";
export * from "../../glyph-arena-collide/src/index.js";
export * from "../../glyph-arena-draw/src/index.js";
export * from "../../glyph-arena-ecs/src/index.js";
export * from "../../glyph-arena-gamepad/src/index.js";
export * from "../../glyph-arena-input/src/index.js";
export * from "../../glyph-arena-loop/src/index.js";
export * from "../../glyph-arena-scene/src/index.js";
export * from "../../glyph-arena-timer/src/index.js";
export * from "../../glyph-arena-transform/src/index.js";
export * from "../../glyph-arena-tween/src/index.js";

/**
 * `Matrix2D` is declared by both `camera` and `transform` with the same shape
 * (`{ a, b, c, d, e, f }`). A flat `export *` of two modules that both export a
 * name makes TypeScript drop the name from the re-export, silently, so it is
 * re-exported here explicitly. `transform` is the one that composes
 * world matrices (`transform.world()`), so its declaration is the canonical one.
 */
export type { Matrix2D } from "../../glyph-arena-transform/src/index.js";
