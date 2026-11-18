#!/usr/bin/env node
/**
 * Build the published tree from every example's `dist/`, and generate the gallery nav.
 *
 * The deploy used to copy three directories with three hand-written `cp` lines, and every page
 * rendered four hand-written `<a>` links. Both are the same bug — a list kept by hand — and it is
 * not theoretical: CAMP shipped, was built, was published, and no page linked to it. Nothing was
 * looking, so nothing went red.
 *
 * So each example declares its own page in its own `package.json`:
 *
 *   "glyphArenaPage": { "path": "/parry/", "label": "Parry" }
 *
 * `path` is where the built `dist/` is copied to under the site base; `label` is the word on the
 * nav link. An example without the field is not published (that has to be said out loud, or it is
 * discovered by a 404); two examples claiming one path is an error.
 *
 * The nav is injected here, after the copy, so every published page gets the same list — including
 * a page whose own HTML has no nav at all. A page can say where the nav goes with
 * `<nav class="gallery-nav" data-glyph-nav></nav>`; a page that says nothing gets it appended to
 * `<body>`, which is unstyled but not missing.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "..");
const EXAMPLES = join(ROOT, "examples");
const SITE = join(ROOT, "site");

/** Where the site is served from. GitHub Pages puts the project at /glyph-arena/. */
export const SITE_BASE = "/glyph-arena/";

/** Pages in the nav that are not an example: the docs are part of the site, not a sample. */
const EXTRA_NAV = [{ label: "API Docs", page: "/docs/" }];

/**
 * Every example that declares where it is published, as `{ name, package, page, label, dist }`.
 *
 * Sorted the way the nav shows them: the root page first (it is the gallery), then by path.
 */
export function publishedExamples(examplesDir) {
  const found = [];

  for (const entry of readdirSync(examplesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const packagePath = join(examplesDir, entry.name, "package.json");
    if (!existsSync(packagePath)) continue;

    const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
    const declared = manifest.glyphArenaPage;
    if (declared === undefined) continue;

    if (typeof declared !== "object" || declared === null || Array.isArray(declared)) {
      throw new Error(
        `${entry.name}: glyphArenaPage must be { "path": "…", "label": "…" } — the nav needs the word too`,
      );
    }

    const { path, label } = declared;
    if (typeof path !== "string" || (path !== "" && (!path.startsWith("/") || !path.endsWith("/")))) {
      throw new Error(`${entry.name}: glyphArenaPage.path must be "" or "/name/" (got ${JSON.stringify(path)})`);
    }
    if (typeof label !== "string" || label.trim() === "") {
      throw new Error(`${entry.name}: glyphArenaPage.label must be a non-empty string`);
    }

    found.push({
      name: entry.name,
      package: manifest.name,
      page: path,
      label,
      dist: join(examplesDir, entry.name, "dist"),
    });
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

  return found.sort((a, b) => (a.page === "" ? -1 : b.page === "" ? 1 : a.page.localeCompare(b.page)));
}

/** The nav every published page shows: every declared example, then the docs. */
export function galleryNav(examples, siteBase = SITE_BASE) {
  return [...examples, ...EXTRA_NAV].map((item) => ({
    label: item.label,
    page: item.page,
    href: `${siteBase}${item.page.replace(/^\//, "")}`,
  }));
}

/** The `<nav>` markup for one page. `aria-current` marks the page the reader is on. */
export function navMarkup(nav, currentPage) {
  const links = nav
    .map((item) => {
      const current = item.page === currentPage ? ' aria-current="page"' : "";
      return `<a href="${item.href}"${current}>${item.label}</a>`;
    })
    .join("\n      ");

  return `<nav class="gallery-nav" aria-label="Glyph Arena demos">\n      ${links}\n    </nav>`;
}

const PLACEHOLDER = /<nav\b[^>]*\bdata-glyph-nav\b[^>]*>\s*<\/nav>/;

/**
 * Put the nav into one page's HTML.
 *
 * A page that carries the placeholder says where it goes; a page that does not gets it at the end
 * of `<body>`. Either way the page ends up with the links, because a page nobody links to is a page
 * nobody plays — the failure this script exists to stop.
 */
export function injectNav(html, nav, currentPage) {
  const markup = navMarkup(nav, currentPage);

  if (PLACEHOLDER.test(html)) return html.replace(PLACEHOLDER, markup);
  if (html.includes("</body>")) return html.replace("</body>", `  ${markup}\n  </body>`);

  throw new Error(`${currentPage}: no </body> to put the nav before`);
}

/** Copy each example's `dist/` into `site/<page>/`, then give every page the same nav. */
export function assembleSite({ examplesDir, siteDir, siteBase = SITE_BASE }) {
  rmSync(siteDir, { recursive: true, force: true });
  mkdirSync(siteDir, { recursive: true });

  const examples = publishedExamples(examplesDir);
  if (examples[0]?.page !== "") {
    throw new Error(`the gallery has no root page: no example declares glyphArenaPage.path ""`);
  }

  const nav = galleryNav(examples, siteBase);

  const copied = [];
  for (const example of examples) {
    if (!existsSync(join(example.dist, "index.html"))) {
      throw new Error(`${example.name}: no built index.html at ${example.dist} — build it first`);
    }

    const target = join(siteDir, example.page);
    mkdirSync(target, { recursive: true });
    cpSync(example.dist, target, { recursive: true });

    const indexPath = join(target, "index.html");
    const page = readFileSync(indexPath, "utf8");
    const withNav = injectNav(page, nav, example.page);
    writeFileSync(indexPath, withNav);

    copied.push({ page: example.page === "" ? "/" : example.page, name: example.name, label: example.label });
  }

  return copied;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const copied = assembleSite({ examplesDir: EXAMPLES, siteDir: SITE });
  for (const entry of copied) console.log(`${entry.name} → ${entry.page} (${entry.label})`);
}
