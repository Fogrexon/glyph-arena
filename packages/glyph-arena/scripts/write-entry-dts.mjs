#!/usr/bin/env node
/**
 * Writes the published type entry, `dist/index.d.ts`.
 *
 * `tsc -p tsconfig.build.json` emits one declaration per source file, rooted at
 * `packages/` — the umbrella re-exports its 14 siblings' sources, so the
 * umbrella entry lands at `dist/glyph-arena/src/index.d.ts` and each sibling at
 * `dist/glyph-arena-<module>/src/index.d.ts`. The package's `types` field points
 * at `dist/index.d.ts`, and the one line written here is what connects the two.
 *
 * The specifier is relative on purpose: the sibling packages are not published
 * to npm, so a bare `@fogrexon/glyph-arena-*` name here would be unresolvable
 * for a consumer installing only this tarball.
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dist = join(import.meta.dirname, "..", "dist");
const entry = join(dist, "glyph-arena", "src", "index.d.ts");

if (!existsSync(entry)) {
  throw new Error(
    `expected ${entry}; if tsconfig.build.json outDir/rootDir changed, update this script`,
  );
}

writeFileSync(
  join(dist, "index.d.ts"),
  'export * from "./glyph-arena/src/index.js";\n',
);
console.log("wrote dist/index.d.ts");
