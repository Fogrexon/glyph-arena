import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GLYPH_BASE ?? "/",
});
