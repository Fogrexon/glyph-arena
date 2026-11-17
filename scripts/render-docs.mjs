#!/usr/bin/env node
/**
 * Renders `docs/*.md` into static HTML for GitHub Pages.
 *
 * Pages serves the demo's `dist/`, and vite copies `public/` verbatim, so
 * writing to `examples/pickup-demo/public/docs/` is all it takes — no vite
 * multi-page config and no markdown parser in the browser bundle.
 *
 * The demo's `build` script runs this first, so a broken doc fails the build
 * instead of shipping half-rendered markdown (see `assertSupportedBlocks`).
 * Two passes: one to collect each page's H1 for the sidebar, one to render.
 */

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  assertSupportedBlocks,
  checkRendered,
  renderMarkdown,
  titleOf,
} from "./docs/markdown.mjs";
import { escapeHtml } from "./docs/escape.mjs";
import { renderPage } from "./docs/page.mjs";
import { exportedDeclarations } from "./lib/public-surface.mjs";

const REPO = resolve(import.meta.dirname, "..");
const DOCS_DIR = join(REPO, "docs");
const PACKAGES_DIR = join(REPO, "packages");
const OUT_DIR = join(REPO, "examples/pickup-demo/public/docs");
const UMBRELLA = "glyph-arena";

/**
 * Pages listed here come first, in this order; every other page follows in
 * filename order (== package name order, stable across machines). The umbrella
 * page is pinned because it answers "what do I install", and alphabetically it
 * would otherwise sit between `gamepad` and `input`.
 */
const PINNED_FIRST = ["tutorial.md", "api-glyph-arena.md"];

function orderDocs(names) {
  const rank = (name) => {
    const index = PINNED_FIRST.indexOf(name);
    return index === -1 ? PINNED_FIRST.length : index;
  };

  return [...names].sort(
    (a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0),
  );
}


/**
 * The module packages, read from `packages/` rather than listed here. A list is a count that goes
 * wrong the day a package is added, which is the failure this file exists to remove.
 */
function modules() {
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${UMBRELLA}-`))
    .map((entry) => entry.name.slice(UMBRELLA.length + 1))
    .sort();
}

function declarationsOf(module) {
  const path = join(PACKAGES_DIR, `${UMBRELLA}-${module}`, "src", "index.ts");
  return exportedDeclarations(readFileSync(path, "utf8"));
}

/**
 * Replaces the body of a page's `## Exports` section with a table generated from the package's
 * source. The section has to exist: a page that lost its heading would otherwise silently ship
 * without its exports, which is the state this change is here to end.
 */
function withGeneratedExports(markdown, module, file) {
  const heading = /^## Exports\s*$/m.exec(markdown);
  if (heading === null) {
    throw new Error(`${file}: no "## Exports" heading to fill from packages/${UMBRELLA}-${module}`);
  }

  const start = heading.index;
  const afterHeading = start + heading[0].length;
  const next = /^## /m.exec(markdown.slice(afterHeading));
  const end = next === null ? markdown.length : afterHeading + next.index;

  const rows = declarationsOf(module)
    .map(({ name, kind }) => `| \`${name}\` | ${kind} |`)
    .join("\n");
  if (rows === "") {
    throw new Error(`${file}: packages/${UMBRELLA}-${module} exports nothing to document`);
  }

  const table = [
    "",
    "Generated from the package's source when the docs are built — do not edit this table by hand.",
    "",
    "| Name | Kind |",
    "| --- | --- |",
    rows,
    "",
  ].join("\n");

  return markdown.slice(0, afterHeading) + table + markdown.slice(end);
}

/** The umbrella's table: every module's value exports, and which module each one comes from. */
function umbrellaExportsSection() {
  const entries = modules().flatMap((module) =>
    declarationsOf(module)
      .filter(({ kind }) => kind !== "type" && kind !== "interface")
      .map(({ name }) => ({ name, module })),
  );
  if (entries.length === 0) {
    throw new Error("no value exports found under packages/: the umbrella table would be empty");
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return [
    "",
    "Generated from `packages/` when the docs are built — do not edit this table by hand.",
    "Type-only names are not listed here; they are in the emitted declarations.",
    "",
    "| Export | Module |",
    "| --- | --- |",
    ...entries.map(({ name, module }) => `| \`${name}\` | ${module} |`),
    "",
  ].join("\n");
}


/** A one-line summary of a module, from its package README's first paragraph. */
function summaryOf(module) {
  const path = join(PACKAGES_DIR, `${UMBRELLA}-${module}`, "README.md");
  const lines = readFileSync(path, "utf8").split("\n");
  const start = lines.findIndex((line) => /^#\s/.test(line));
  const rest = lines.slice(start + 1).filter((line) => line.trim() !== "");
  const paragraph = [];
  for (const line of rest) {
    if (/^#/.test(line)) break;
    paragraph.push(line.trim());
    if (paragraph.join(" ").endsWith(".")) break;
  }
  const text = paragraph.join(" ").replace(/\s+/g, " ").trim();
  if (text === "") {
    throw new Error(`packages/${UMBRELLA}-${module}/README.md has no summary paragraph`);
  }
  return text;
}

/**
 * Replaces the README's `## Packages` table with one row per module. The table was hand-written
 * with a fixed count, so the day a package was added the front page lied about the repository.
 */
function withGeneratedPackageTable(markdown) {
  const heading = /^## Packages\s*$/m.exec(markdown);
  if (heading === null) return markdown;
  const afterHeading = heading.index + heading[0].length;
  const next = /^## /m.exec(markdown.slice(afterHeading));
  const end = next === null ? markdown.length : afterHeading + next.index;

  const rows = modules()
    .map((module) => `| \`${UMBRELLA}-${module}\` | ${summaryOf(module)} | [api](docs/api-${module}.md) |`)
    .join("\n");

  const table = [
    "",
    "Generated from `packages/` when the docs are built — do not edit this table by hand.",
    "",
    "| Module | What it does | API |",
    "| --- | --- | --- |",
    rows,
    "",
  ].join("\n");

  return markdown.slice(0, afterHeading) + table + markdown.slice(end);
}

function main() {
  const files = orderDocs(
    readdirSync(DOCS_DIR).filter((name) => name.endsWith(".md")),
  );

  if (files.length === 0) {
    throw new Error(`no markdown found in ${DOCS_DIR}`);
  }

  // Every module needs a page, and every page's Exports table comes from the module's source.
  const documented = new Set(
    files
      .filter((file) => /^api-.+\.md$/.test(file) && file !== `api-${UMBRELLA}.md`)
      .map((file) => file.slice("api-".length, -".md".length)),
  );
  const missing = modules().filter((module) => !documented.has(module));
  if (missing.length > 0) {
    throw new Error(
      `no docs page for ${missing.length} module(s): ` +
        missing.map((module) => `docs/api-${module}.md`).join(", "),
    );
  }

  const sources = files.map((file) => {
    const path = join(DOCS_DIR, file);
    let markdown = readFileSync(path, "utf8");

    if (file === `api-${UMBRELLA}.md`) {
      const heading = /^## Exports\s*$/m.exec(markdown);
      if (heading === null) {
        throw new Error(`${file}: no "## Exports" heading to fill from packages/`);
      }
      const afterHeading = heading.index + heading[0].length;
      const next = /^## /m.exec(markdown.slice(afterHeading));
      const end = next === null ? markdown.length : afterHeading + next.index;
      markdown = markdown.slice(0, afterHeading) + umbrellaExportsSection() + markdown.slice(end);
    } else if (/^api-.+\.md$/.test(file)) {
      markdown = withGeneratedExports(markdown, file.slice("api-".length, -".md".length), file);
    }

    assertSupportedBlocks(markdown, file);
    return { file, path, markdown, title: titleOf(path, file) };
  });

  // Sidebar: pinned pages first, then filename order; labels from each page's H1.
  const sidebar = sources.map(({ file, title }) => ({
    href: file.replace(/\.md$/, ".html"),
    label: title,
  }));

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const totals = { headings: 0, tables: 0, codeBlocks: 0, listItems: 0, sections: 0 };
  const rendered = [];

  for (const { file, path, markdown, title } of sources) {
    const { html, meta } = renderMarkdown(markdown, path);
    checkRendered(html, file);

    for (const key of Object.keys(totals)) totals[key] += meta[key] ?? 0;

    const href = file.replace(/\.md$/, ".html");
    writeFileSync(
      join(OUT_DIR, href),
      renderPage({
        title,
        body: html,
        sidebar,
        sections: meta.sections,
        current: href,
      }),
    );
    rendered.push({ href, title, sections: meta.sections.length });
  }

  const list = rendered
    .map(
      ({ href, title }) =>
        `<li><a href="${href}">${escapeHtml(title)}</a></li>`,
    )
    .join("\n");
  // The docs front page is the repository README, rendered from the same file
  // GitHub shows: one source, two entry points, links rewritten by the same rule.
  const readmePath = join(REPO, "README.md");
  const readme = withGeneratedPackageTable(readFileSync(readmePath, "utf8"));
  assertSupportedBlocks(readme, "README.md");
  const { html: readmeHtml, meta: readmeMeta } = renderMarkdown(readme, readmePath);
  checkRendered(readmeHtml, "README.md");

  // The 14-page list stays in the body under the README: the sidebar collapses
  // on narrow screens, so the list has to exist in the flow too.
  writeFileSync(
    join(OUT_DIR, "index.html"),
    renderPage({
      title: "API docs", // the shell appends " — Glyph Arena"
      body: `${readmeHtml}\n<h2 id="api-pages">API pages</h2>\n<p>One page per package.</p>\n<ul>\n${list}\n</ul>`,
      sidebar,
      sections: [...readmeMeta.sections, { id: "api-pages", text: "API pages" }],
      current: "",
    }),
  );

  const outline = rendered.reduce((sum, page) => sum + page.sections, 0);
  console.log(
    `rendered ${rendered.length} docs (+index) → examples/pickup-demo/public/docs ` +
      `[${totals.headings} headings, ${totals.tables} tables, ${totals.codeBlocks} code blocks, ` +
      `${totals.listItems} list items, ${outline} H2 anchors]`,
  );
}

try {
  main();
} catch (error) {
  console.error(`docs render failed: ${error.message}`);
  process.exit(1);
}
