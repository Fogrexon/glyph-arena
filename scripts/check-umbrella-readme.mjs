#!/usr/bin/env node
// The umbrella README ships inside the tarball, so npm shows it until the next version: it is the
// one "hand-kept list" in this repo that *freezes*. Everything below is derived from packages/.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const readme = readFileSync(join(ROOT, "packages", "glyph-arena", "README.md"), "utf8");
const failures = [];
const ok = (m) => console.log(`PASS  ${m}`);
const fail = (m) => { failures.push(m); console.error(`FAIL  ${m}`); };

// 1) No module count. A number here is wrong the next time a module lands — and it is frozen.
const counted = readme.match(/\b\d+\s+(?:small\s+)?modules?\b/gi) ?? [];
if (counted.length > 0) fail(`the README states a module count (${counted.join(", ")}) — the count is derived, not written`);
else ok("no module count in the README");

// 2) Every workspace module is named. The list comes from packages/, not from the prose.
const modules = readdirSync(join(ROOT, "packages"))
  .filter((d) => d.startsWith("glyph-arena-"))
  .map((d) => d.replace("glyph-arena-", ""));
const missing = modules.filter((m) => !new RegExp(`\\b${m}\\b`).test(readme));
if (missing.length > 0) fail(`these modules are not named in the README: ${missing.join(", ")}`);
else ok(`every module is named (${modules.length}, read from packages/)`);

// 3) The first thing a reader sees must be the library's promise: a screen with no image files.
if (!/\.rect\(/.test(readme) || !/\.text\(/.test(readme)) fail("the README never calls draw.rect / draw.text — a screen with no images is the reason this library exists");
else ok("the README shows draw.rect and draw.text");

if (failures.length > 0) {
  console.error(`\npackages/glyph-arena/README.md ships as-is. Fix it before publishing: the tarball freezes it.`);
  process.exit(1);
}
console.log("\nthe umbrella README is safe to freeze");
