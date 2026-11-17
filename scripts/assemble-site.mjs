#!/usr/bin/env node
/**
 * Build the published tree from every example's `dist/`.
 *
 * The deploy used to copy three directories with three hand-written `cp` lines. A list of pages
 * maintained by hand is a page that silently stops being published when an example is added — the
 * same shape as the package list that broke the deploy earlier today. Each example declares where
 * it is published in its own `package.json` (`glyphArenaPage`), and this script reads that:
 *
 *   ""        → the site root        (the published homepage)
 *   "/parry/" → /parry/
 *
 * An example without the field is an error rather than a silent omission: "not published" has to be
 * said out loud, or it will be discovered by a 404.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "..");
const EXAMPLES = join(ROOT, "examples");
const SITE = join(ROOT, "site");

/** Every example that declares where it is published, as `{ name, page, dist }`. */
export function publishedExamples(examplesDir) {
  const found = [];

  for (const entry of readdirSync(examplesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const packagePath = join(examplesDir, entry.name, "package.json");
    if (!existsSync(packagePath)) continue;

    const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
    if (manifest.glyphArenaPage === undefined) continue;

    if (typeof manifest.glyphArenaPage !== "string") {
      throw new Error(`${entry.name}: glyphArenaPage must be a string`);
    }

    found.push({ name: entry.name, page: manifest.glyphArenaPage, dist: join(examplesDir, entry.name, "dist") });
  }

  const seen = new Map();
  for (const example of found) {
    const other = seen.get(example.page);
    if (other !== undefined) {
      throw new Error(`${example.name} and ${other} both claim the page "${example.page}"`);
    }
    seen.set(example.page, example.name);
  }

  if (found.length === 0) throw new Error(`no example declares glyphArenaPage under ${examplesDir}`);

  return found.sort((a, b) => a.page.length - b.page.length);
}

/** Copy each example's `dist/` into `site/<page>/`. */
export function assembleSite({ examplesDir, siteDir }) {
  rmSync(siteDir, { recursive: true, force: true });
  mkdirSync(siteDir, { recursive: true });

  const copied = [];
  for (const example of publishedExamples(examplesDir)) {
    if (!existsSync(join(example.dist, "index.html"))) {
      throw new Error(`${example.name}: no built index.html at ${example.dist} — build it first`);
    }

    const target = join(siteDir, example.page);
    mkdirSync(target, { recursive: true });
    cpSync(example.dist, target, { recursive: true });
    copied.push({ page: example.page === "" ? "/" : example.page, name: example.name });
  }

  return copied;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const copied = assembleSite({ examplesDir: EXAMPLES, siteDir: SITE });
  for (const entry of copied) console.log(`${entry.name} → ${entry.page}`);
}
