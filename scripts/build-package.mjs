#!/usr/bin/env node
/**
 * Build one workspace package and stamp it.
 *
 * Every package's `build` script is this one line, so the stamp cannot drift from the build and the
 * package name is not written down 19 times: it is the directory the build ran in.
 *
 * The stamp exists because the packages have **no `prepack`**: `pnpm pack` ships whatever is in
 * `dist/`. CI builds before it packs, so CI is safe; a local `pnpm smoke:pack-install` after an
 * edit is not, and it is exactly the "tested an artifact nobody built" green that `lib/build-stamp.mjs`
 * exists to turn red.
 *
 * Usage: `"build": "node ../../scripts/build-package.mjs"` in a package whose build is `tsc`.
 */
import { execFileSync } from "node:child_process";
import { basename, join } from "node:path";

import { writeStamp } from "./lib/build-stamp.mjs";

const root = new URL("..", import.meta.url).pathname;
const dir = process.cwd();
const kind = `package:${basename(dir)}`;

execFileSync(join(root, "node_modules", ".bin", "tsc"), ["-p", "tsconfig.json"], { stdio: "inherit" });

const { hash, files } = writeStamp(kind, root, join(dir, "dist"));
console.log(`stamped ${kind}: ${files} input file(s), ${hash.slice(0, 12)}`);
