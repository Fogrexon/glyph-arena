import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import * as api from "../src/index.js";

/**
 * The value exports this flat re-export must expose: every module's, and nothing else.
 *
 * The modules are read from `packages/` rather than listed here, because a list is a count that
 * goes wrong the day a package is added — the same failure the deploy build and the smoke consumer
 * had. The check still turns red when a module drops out of `src/index.ts`, which is what the list
 * was for: the module's own exports then have no counterpart in `api`.
 *
 * Type-only exports are checked by `pnpm typecheck:public-api`, which imports `Matrix2D` by name
 * from this package and compiles against the emitted declaration.
 */
const packagesRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const modules = readdirSync(packagesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("glyph-arena-") && entry.name !== "glyph-arena")
  .map((entry) => entry.name)
  .sort();

const exportsOf = new Map<string, string[]>();
for (const name of modules) {
  const module = await import(`../../${name}/src/index.js`);
  exportsOf.set(name, Object.keys(module));
}

const expectedValueExports = [...new Set([...exportsOf.values()].flat())].sort();

describe("@fogrexon/glyph-arena", () => {
  it("re-exports every module's value export and nothing else", () => {
    assert.ok(modules.length > 0, "no modules found: the umbrella test would pass with nothing");
    assert.deepEqual(Object.keys(api).sort(), expectedValueExports);
  });

  it("exposes each module's value export through the umbrella", () => {
    for (const name of modules) {
      for (const exported of exportsOf.get(name) ?? []) {
        assert.ok(exported in api, `${name} exports ${exported}, the umbrella does not`);
      }
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
});
