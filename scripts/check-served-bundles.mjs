#!/usr/bin/env node
/**
 * Compare what the deploy just built with what the site is actually serving.
 *
 * This replaces `docs/bundles.json` and the hand-run `check:deployed`. A record committed to the
 * repository is a *proxy* for "the deploy landed", and a proxy drifts: today `main` was green while
 * Pages served a bundle two deploys old. So there is no record any more — the deploy compares the
 * real thing with the real thing, in the job that made it:
 *
 *   the `assets/index-*.js` named by each built page
 *   the `index-*.js` the live page's HTML names
 *
 * The page list is not written down here or anywhere: it is every `index.html` in the built site,
 * so adding an example adds a page to check. A hand-written list would be the fifth "adding a page
 * makes it red" waiting to happen.
 *
 * Usage:
 *   node scripts/assemble-site.mjs && node scripts/check-served-bundles.mjs --site=site
 *   node scripts/check-served-bundles.mjs --site=pages --timeout=180 --interval=15
 *   GLYPH_ARENA_BASE=https://example.test node scripts/check-served-bundles.mjs --site=site
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "..");
const DEFAULT_BASE = "https://fogrexon.github.io/glyph-arena";

/** The `index-*.js` a page's HTML names. Exactly one, or the page is not a single deploy. */
export function bundlesInHtml(html) {
  return [...new Set([...html.matchAll(/index-[A-Za-z0-9_-]+\.js/g)].map((match) => match[0]))];
}

/** The published page URL for a page path taken from the built tree (`/`, `/parry/`, …). */
export function pageUrl(base, page) {
  const root = base.endsWith("/") ? base : `${base}/`;
  const path = page.replace(/^\/+/, "");

  return `${root}${path}`;
}

/**
 * Every page in a built site: `{ page, bundles }`, where `page` is the published path. The list
 * comes from the tree itself, so an example that is published is a page that is checked.
 */
export function pagesInSite(siteDir) {
  const pages = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (entry !== "index.html") continue;

      const parent = relative(siteDir, dir).split(sep).join("/");
      pages.push({
        page: parent === "" ? "/" : `/${parent}/`,
        bundles: bundlesInHtml(readFileSync(full, "utf8")),
      });
    }
  };

  walk(siteDir);

  return pages.sort((a, b) => a.page.length - b.page.length);
}

/**
 * Compare one page: what was built against what is served. Returns `{ ok, detail }` rather than
 * throwing, so the caller can retry everything and report every page at once.
 */
export function comparePage({ page, built, servedHtml, base }) {
  const url = pageUrl(base, page);
  const served = bundlesInHtml(servedHtml);

  if (served.length !== 1) {
    return {
      ok: false,
      url,
      detail: `serves ${served.length} bundles${served.length ? ` (${served.join(", ")})` : ""}`,
    };
  }

  if (served[0] !== built) {
    return { ok: false, url, detail: `serves ${served[0]}, the build made ${built}` };
  }

  return { ok: true, url, detail: `serves ${built}` };
}

async function fetchHtml(url) {
  const response = await fetch(`${url}?cb=${Date.now()}`, { headers: { "cache-control": "no-cache" } });

  return response.ok ? { ok: true, text: await response.text() } : { ok: false, status: response.status };
}

async function checkOnce(base, siteDir) {
  const results = [];

  for (const { page, bundles } of pagesInSite(siteDir)) {
    // A page with no bundle is a static page (the rendered docs): there is nothing to compare, and
    // calling it a failure would make the docs page a permanent red.
    if (bundles.length === 0) continue;

    if (bundles.length !== 1) {
      results.push({
        ok: false,
        url: pageUrl(base, page),
        detail: `the build made ${bundles.length} bundles${bundles.length ? ` (${bundles.join(", ")})` : ""}`,
      });
      continue;
    }

    const served = await fetchHtml(pageUrl(base, page));
    if (!served.ok) {
      results.push({ ok: false, url: pageUrl(base, page), detail: `HTTP ${served.status}` });
      continue;
    }

    results.push(comparePage({ page, built: bundles[0], servedHtml: served.text, base }));
  }

  return results;
}

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found === undefined ? fallback : found.slice(prefix.length);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const base = process.env.GLYPH_ARENA_BASE ?? DEFAULT_BASE;
  const siteDir = resolve(ROOT, argValue("site", "site"));
  const timeoutMs = Number(argValue("timeout", "180")) * 1000;
  const intervalMs = Number(argValue("interval", "15")) * 1000;

  if (!existsSync(siteDir)) {
    console.error(`no built site at ${siteDir} — run \`node scripts/assemble-site.mjs\` first`);
    process.exitCode = 1;
  } else {
    const deadline = Date.now() + timeoutMs;
    let results = await checkOnce(base, siteDir);

    while (results.some((result) => !result.ok) && Date.now() < deadline) {
      await new Promise((done) => setTimeout(done, intervalMs));
      results = await checkOnce(base, siteDir);
    }

    for (const result of results) {
      console.log(`${result.ok ? "ok  " : "FAIL"} ${result.url} — ${result.detail}`);
    }

    if (results.some((result) => !result.ok)) {
      console.error("deployed: the site does not serve what this build produced");
      process.exitCode = 1;
    } else {
      console.log(`deployed: ${results.length} page(s) serve the bundle this build produced`);
    }
  }
}
