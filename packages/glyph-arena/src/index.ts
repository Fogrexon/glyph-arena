/**
 * `@fogrexon/glyph-arena` — the whole runtime in one package.
 *
 * This is the package intended for npm. It bundles the workspace modules
 * (which stay internal to this repo) and re-exports their public API flat, so a
 * consumer writes one import instead of one per module:
 *
 * ```ts
 * import { createWorld, createLoop, createTimer } from "@fogrexon/glyph-arena";
 * ```
 *
 * ## Why the specifiers are relative
 *
 * `tsc` copies module specifiers into the emitted `.d.ts` verbatim, and the modules
 * are **not** published on their own. Naming them here the way they are
 * imported inside this repo would therefore publish declarations that no
 * consumer can resolve (those names exist only in this monorepo). Relative paths
 * keep the emitted declaration tree self-contained under `dist/`, the bundler
 * inlines the same sources into the single ESM build, and the published package
 * has no `dependencies`.
 */
export * from "../../glyph-arena-actions/src/index.js";
export * from "../../glyph-arena-assets/src/index.js";
export * from "../../glyph-arena-audio/src/index.js";
export * from "../../glyph-arena-body/src/index.js";
export * from "../../glyph-arena-camera/src/index.js";
export * from "../../glyph-arena-collide/src/index.js";
export * from "../../glyph-arena-draw/src/index.js";
export * from "../../glyph-arena-ecs/src/index.js";
export * from "../../glyph-arena-gamepad/src/index.js";
export * from "../../glyph-arena-input/src/index.js";
export * from "../../glyph-arena-loop/src/index.js";
export * from "../../glyph-arena-scene/src/index.js";
export * from "../../glyph-arena-tilemap/src/index.js";
export * from "../../glyph-arena-timer/src/index.js";
export * from "../../glyph-arena-transform/src/index.js";
export * from "../../glyph-arena-tween/src/index.js";

/**
 * `Matrix2D` is declared by both `camera` and `transform` with the same shape
 * (`{ a, b, c, d, e, f }`). Two star exports of one name make the emitted
 * declaration ambiguous, which `tsc` rejects (TS2308), so the declaration is
 * re-exported explicitly here. `transform` is the module that composes world
 * matrices (`transform.world()`), so its declaration is the canonical one.
 */
export type { Matrix2D } from "../../glyph-arena-transform/src/index.js";
