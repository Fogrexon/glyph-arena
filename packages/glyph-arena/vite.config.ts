import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

/**
 * Library build for the single-package distribution.
 *
 * Nothing is marked external: the 14 sibling modules are compiled in, so the
 * published package has no `dependencies` (they are not published to npm).
 * `index.js` is the ESM build (the package is `"type": "module"`) and
 * `index.cjs` the CommonJS one. Declaration files are emitted separately by
 * `tsc -p tsconfig.build.json`.
 */
export default defineConfig({
  build: {
    lib: {
      entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      formats: ["es", "cjs"],
      fileName: (format) => (format === "es" ? "index.js" : "index.cjs"),
    },
    target: "es2022",
    minify: false,
    sourcemap: true,
  },
});
