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

const REPO = resolve(import.meta.dirname, "..");
const DOCS_DIR = join(REPO, "docs");
const OUT_DIR = join(REPO, "examples/pickup-demo/public/docs");

function main() {
  const files = readdirSync(DOCS_DIR)
    .filter((name) => name.endsWith(".md"))
    .sort(); // filename order == package name order, stable across machines

  if (files.length === 0) {
    throw new Error(`no markdown found in ${DOCS_DIR}`);
  }

  const sources = files.map((file) => {
    const path = join(DOCS_DIR, file);
    const markdown = readFileSync(path, "utf8");
    assertSupportedBlocks(markdown, file);
    return { file, path, markdown, title: titleOf(path, file) };
  });

  // Sidebar: filename order, labels from each page's H1.
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
  writeFileSync(
    join(OUT_DIR, "index.html"),
    renderPage({
      title: "API docs",
      body: `<h1>API docs</h1>\n<p>One page per package.</p>\n<ul>\n${list}\n</ul>`,
      sidebar,
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
