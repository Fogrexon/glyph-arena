#!/usr/bin/env node
/**
 * Fails when a package's published entry points point at files that do not
 * exist on disk (`main`, `types`, `exports["."].import`, `exports["."].types`).
 *
 * Why this exists next to `fixtures/public-api`: once `tsconfig.base.json` maps
 * `@fogrexon/glyph-arena-*` to `packages/*\/src`, no TypeScript check looks at
 * `package.json`'s `exports`/`types` any more, and vite only follows the
 * `import` condition. A `types` path typo would otherwise reach npm unnoticed.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PACKAGES_DIR = "packages";

/** @param {string} dir @returns {string[]} */
function entryFields(dir) {
  const manifestPath = join(dir, "package.json");
  if (!existsSync(manifestPath)) return [];

  const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));
  const fields = [];
  if (typeof pkg.main === "string") fields.push(pkg.main);
  if (typeof pkg.types === "string") fields.push(pkg.types);

  const rootExport = pkg.exports?.["."];
  if (typeof rootExport === "string") {
    fields.push(rootExport);
  } else if (rootExport && typeof rootExport === "object") {
    for (const value of Object.values(rootExport)) {
      if (typeof value === "string") fields.push(value);
    }
  }

  return [...new Set(fields)];
}

let failed = false;
let checked = 0;

for (const dir of readdirSync(PACKAGES_DIR)) {
  const packageDir = join(PACKAGES_DIR, dir);
  const fields = entryFields(packageDir);
  if (fields.length === 0) continue;

  checked += 1;
  for (const field of fields) {
    if (!existsSync(join(packageDir, field))) {
      console.error(`missing entry file: ${packageDir}/${field}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error(
    "Package entry points must reference files produced by `pnpm -r build`.",
  );
  process.exit(1);
}

console.log(`package entry points ok (${checked} packages)`);
