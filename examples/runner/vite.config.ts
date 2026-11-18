import { defineConfig } from "vite";

/**
 * The published demo lives at /glyph-arena/runner/. Anything else (dev, the
 * verification pod) is "/".
 */
export default defineConfig({
  base: process.env.GLYPH_BASE ?? "/",
});
