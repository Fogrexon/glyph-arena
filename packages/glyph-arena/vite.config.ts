import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

/**
 * Library build for the single-package distribution.
 *
 * Nothing is marked external: the 14 sibling modules are compiled in, so the
 * published package has no `dependencies` (they are not published to npm).
 * ESM only, like the 14 modules: a CommonJS build would need a second
 * declaration file (`index.d.cts`) and a single `types` attached to a `require`
 * condition is the classic masquerading trap for NodeNext consumers.
 * Declaration files are emitted separately by `tsc -p tsconfig.build.json`.
 */
export default defineConfig({
  build: {
    lib: {
      entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      formats: ["es"],
      fileName: () => "index.js",
    },
    target: "es2022",
    minify: false,
    sourcemap: true,
  },
});
