import { defineConfig } from "vite";

// Not published: the fixture is served from 127.0.0.1 by `scripts/e2e-tutorial.mjs`, so relative
// asset paths are all it needs. Two pages: the tutorial's program, and the pad the phone section
// builds (the gate probes its zones at several widths).
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: { main: "index.html", phone: "phone.html" },
    },
  },
});
