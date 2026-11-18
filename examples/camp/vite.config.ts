import { defineConfig } from "vite";

/**
 * The published slice lives at /glyph-arena/camp/. Anything else (dev, the pod) is "/".
 */
export default defineConfig({
  base: process.env.GLYPH_BASE ?? "/",
});
