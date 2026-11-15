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
    .sort();

  if (files.length === 0) {
    throw new Error(`no markdown found in ${DOCS_DIR}`);
  }

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const rendered = [];
  const totals = { headings: 0, tables: 0, codeBlocks: 0, listItems: 0 };

  for (const file of files) {
    const sourcePath = join(DOCS_DIR, file);
    const markdown = readFileSync(sourcePath, "utf8");
    assertSupportedBlocks(markdown, file);

    const { html, meta } = renderMarkdown(markdown, sourcePath);
    checkRendered(html, file);

    for (const key of Object.keys(totals)) totals[key] += meta[key];

    const title = titleOf(sourcePath, file);
    writeFileSync(join(OUT_DIR, file.replace(/\.md$/, ".html")), renderPage(title, html));
    rendered.push({ file, title });
  }

  const list = rendered
    .map(
      ({ file, title }) =>
        `<li><a href="${file.replace(/\.md$/, ".html")}">${escapeHtml(title)}</a></li>`,
    )
    .join("\n");
  writeFileSync(
    join(OUT_DIR, "index.html"),
    renderPage(
      "API docs",
      `<h1>API docs</h1>\n<p>One page per package.</p>\n<ul>\n${list}\n</ul>`,
    ),
  );

  console.log(
    `rendered ${rendered.length} docs (+index) → examples/pickup-demo/public/docs ` +
      `[${totals.headings} headings, ${totals.tables} tables, ${totals.codeBlocks} code blocks, ${totals.listItems} list items]`,
  );
}

try {
  main();
} catch (error) {
  console.error(`docs render failed: ${error.message}`);
  process.exit(1);
}
