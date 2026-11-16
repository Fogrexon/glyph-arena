import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as api from "../src/index.js";

/**
 * The value exports the flat re-export must expose — one per module (collide
 * exports `overlaps`, the rest export a `create*` factory). Type-only exports
 * are checked by `pnpm typecheck:public-api` instead, which imports `Matrix2D`
 * by name from this package and compiles against the emitted declaration.
 *
 * This list is exact on purpose: a module silently dropping out of
 * `src/index.ts` (or a new export bypassing review of the published surface)
 * turns this red instead of shipping.
 */
const expectedValueExports = [
  "createActions",
  "createAssets",
  "createAudio",
  "createCamera",
  "createDraw",
  "createForest",
  "createGamepad",
  "createInput",
  "createLoop",
  "createTimer",
  "createTransform",
  "createTween",
  "createWorld",
  "overlaps",
] as const;

describe("@fogrexon/glyph-arena", () => {
  it("re-exports every module's value export and nothing else", () => {
    assert.deepEqual(
      Object.keys(api).sort(),
      [...expectedValueExports].sort(),
    );
  });

  it("exposes each value export as a function", () => {
    for (const name of expectedValueExports) {
      assert.equal(typeof api[name], "function", `${name} is not a function`);
    }
  });

  it("runs a module through the umbrella entry", () => {
    const world = api.createWorld();
    const entity = world.spawn();
    world.set(entity, "hp", 3);

    assert.equal(world.get(entity, "hp"), 3);
    const a = { x: 0, y: 0, width: 2, height: 2 };
    const b = { x: 1, y: 1, width: 2, height: 2 };
    assert.equal(api.overlaps(a, b), true);
  });

  // `Matrix2D` (declared by both camera and transform) is type-only, so the
  // guard that it survives the ambiguous `export *` lives where types are
  // checked: `fixtures/public-api/index.mts` imports it from this package by
  // name and `pnpm typecheck:public-api` compiles against the emitted d.ts.
});
