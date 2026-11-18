import { defineConfig } from "vite";

// Not published: the fixture is served from 127.0.0.1 by `scripts/e2e-tutorial.mjs`, so relative
// asset paths are all it needs.
export default defineConfig({
  base: "./",
});
