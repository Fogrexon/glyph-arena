import { defineConfig } from "vite";

/**
 * The published demo lives at /glyph-arena/parry/ so the frozen pickup demo can
 * keep serving /glyph-arena/. Anything else (dev, the verification pod) is "/".
 */
export default defineConfig({
  base: process.env.PARRY_BASE ?? "/",
});
