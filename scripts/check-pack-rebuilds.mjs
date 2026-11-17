#!/usr/bin/env node
/**
 * `pnpm pack` must produce a package that can be imported, starting from a checkout where nothing
 * has been built.
 *
 * It did not: the umbrella lists `files: ["dist"]` and had no `prepack`, so packing a fresh clone
 * built a tarball of LICENSE, README and package.json — a success exit code and an empty package.
 * `smoke:pack-install` could not see it because CI builds first, so the one path a real user takes
 * (`pnpm install`, then `pack`/`publish`) was never exercised.
 *
 * So: remove `dist/`, pack without building, and look inside the tarball.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..");
const PACKAGE_DIR = join(REPO, "packages", "glyph-arena");
const DIST = join(PACKAGE_DIR, "dist");

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`ok   ${message}`);
}

const work = mkdtempSync(join(tmpdir(), "glyph-pack-"));

try {
  // A fresh clone has no dist/. Removing it here is what makes this the same path.
  rmSync(DIST, { recursive: true, force: true });

  const packed = run("pnpm", ["pack", "--pack-destination", work], PACKAGE_DIR);
  const tarball = packed
    .split("\n")
    .map((line) => line.trim())
    .reverse()
    .find((line) => line.endsWith(".tgz"));

  if (tarball === undefined) {
    fail("pnpm pack reported no tarball");
  } else {
    const listing = run("tar", ["-tzf", tarball], REPO).split("\n");
    const required = [
      "package/package.json",
      "package/dist/index.js",
      "package/dist/index.d.ts",
    ];
    const missing = required.filter((entry) => !listing.includes(entry));

    if (missing.length > 0) {
      fail(
        `the tarball packs without being built, so it cannot be imported: ${missing.join(", ")} — ` +
          "add a `prepack` script that builds, so `pack` from a fresh clone ships dist/",
      );
    } else {
      ok(`packing a fresh checkout rebuilds dist/ (${listing.length} entries in the tarball)`);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (process.exitCode) {
  console.error("pack check failed");
} else {
  console.log("pack check passed");
}
