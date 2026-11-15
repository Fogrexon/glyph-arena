#!/usr/bin/env node
/**
 * Renders `docs/*.md` into static HTML for GitHub Pages.
 *
 * Pages serves the demo's `dist/`, and vite copies `public/` verbatim, so
 * writing to `examples/pickup-demo/public/docs/` is enough — no vite multi-page
 * config, no runtime markdown parser in the bundle.
 *
 * Deliberately dependency-free: the repo's pnpm lockfile is small enough that
 * adding a renderer package would mean regenerating and review-diffing it, and
 * `docs/` only uses headings, paragraphs, unordered lists, tables, fenced
 * code, inline code, bold and links. The guard below is what keeps that true:
 * if a doc starts using a construct this renderer does not handle, the build
 * fails instead of shipping half-rendered markdown.
 */

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..");
const DOCS_DIR = join(REPO, "docs");
const OUT_DIR = join(REPO, "examples/pickup-demo/public/docs");
const GITHUB_BLOB = "https://github.com/Fogrexon/glyph-arena/blob/main";

const INLINE_CODE = /`([^`]+)`/g;

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace//"/g, "&quot;");
}

/** `docs/api-x.md` -> `api-x.html`, repo files -> GitHub blob, other links untouched. */
function rewriteHref(href, sourceDoc) {
  if (/^https?:|^#|^mailto:/.test(href)) return href;

  const [pathPart, hash = ""] = href.split("#");
  if (pathPart.endsWith(".md")) {
    const base = pathPart.slice(pathPart.lastIndexOf("/") + 1);
    if (pathPart.startsWith("docs/") || pathPart.startsWith("./")) {
      return `${base.replace(/\.md$/, ".html")}${hash ? `#${hash}` : ""}`;
    }
    const repoPath = resolve(dirname(sourceDoc), pathPart);
    if (repoPath.startsWith(REPO)) {
      const rel = repoPath.slice(REPO.length + 1);
      return `${GITHUB_BLOB}/${rel}${hash ? `#${hash}` : ""}`;
    }
  }
  return href;
}

/** Inline formatting: code spans, bold, links. */
function renderInline(text, sourceDoc) {
  const codeSpans = [];
  let out = text.replace(INLINE_CODE, (_, code) => {
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });

  out = escapeHtml(out);
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_, label, href) =>
      `<a href="${escapeHtml(rewriteHref(href, sourceDoc))}">${label}</a>`,
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\u0000(\d+)\u0000/g, (_, index) => codeSpans[Number(index)]);
  return out;
}

function renderTable(rows, sourceDoc) {
  const cells = (line) =>
    line
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim());

  const [header, , ...body] = rows;
  const head = cells(header)
    .map((cell) => `<th>${renderInline(cell, sourceDoc)}</th>`)
    .join("");
  const bodyRows = body
    .map(
      (row) =>
        `<tr>${cells(row)
          .map((cell) => `<td>${renderInline(cell, sourceDoc)}</td>`)
          .join("")}</tr>`,
    )
    .join("\n");

  return { html: `<table>\n<thead><tr>${head}</tr></thead>\n<tbody>${bodyRows}</tbody>\n</table>`, count: 1 };
}

/**
 * @param {string} markdown
 * @param {string} sourceDoc absolute path of the source file, for link rewriting
 */
export function renderMarkdown(markdown, sourceDoc) {
  const lines = markdown.split("\n");
  const out = [];
  const meta = { headings: 0, codeBlocks: 0, tables: 0, listItems: 0 };
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const body = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1;
      meta.codeBlocks += 1;
      const language = fence[1] ? ` class="language-${fence[1]}"` : "";
      out.push(
        `<pre><code${language}>${escapeHtml(body.join("\n"))}</code></pre>`,
      );
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      meta.headings += 1;
      out.push(`<h${level}>${renderInline(heading[2].trim(), sourceDoc)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\|/.test(line) && index + 1 < lines.length && /^\|[\s:-]+\|/.test(lines[index + 1])) {
      const rows = [];
      while (index < lines.length && /^\|/.test(lines[index])) {
        rows.push(lines[index]);
        index += 1;
      }
      const table = renderTable(rows, sourceDoc);
      meta.tables += table.count;
      out.push(table.html);
      continue;
    }

    if (/^- /.test(line)) {
      const items = [];
      while (index < lines.length && /^- /.test(lines[index])) {
        items.push(lines[index].replace(/^- /, "").trim());
        index += 1;
        meta.listItems += 1;
      }
      out.push(
        `<ul>\n${items.map((item) => `<li>${renderInline(item, sourceDoc)}</li>`).join("\n")}\n</ul>`,
      );
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !/^```|^#{1,4}\s|^\|/.test(lines[index]) &&
      !/^- /.test(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    out.push(`<p>${renderInline(paragraph.join(" "), sourceDoc)}</p>`);
  }

  return { html: out.join("\n"), meta };
}

/**
 * Rejects block constructs this renderer does not implement, instead of
 * silently rendering them as paragraphs. Ordered lists, blockquotes, images,
 * setext rules and indented code would all "look fine" as text and be wrong.
 */
export function assertSupportedBlocks(markdown, sourceName) {
  const lines = markdown.split("\n");
  let inFence = false;
  const unsupported = [];

  for (const line of lines) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const checks = [
      [/^\s*>/, "blockquote (>)"],
      [/^\s*\d+\.\s/, "ordered list (1.)"],
      [/^\s*[*+]\s/, "bullet list (* or +)"],
      [/^\s*!\[/, "image (![])"],
      [/^\s*(-{3,}|\*{3,}|_{3,})\s*$/, "thematic break (---)"],
      [/^\s{2,}\S/, "indented continuation"],
      [/^\s*<[a-zA-Z]/, "raw html"],
      [/^\s*\[[^\]]+\]:/, "reference link definition"],
    ];
    for (const [pattern, label] of checks) {
      if (pattern.test(line)) unsupported.push(`${label}: ${line.trim().slice(0, 60)}`);
    }
  }

  if (unsupported.length > 0) {
    throw new Error(
      `${sourceName}: unsupported markdown block(s) — extend scripts/render-docs.mjs:\n  ` +
        unsupported.slice(0, 5).join("\n  "),
    );
  }
}

/** Fails when the markdown subset above was not enough to consume the source. */
export function checkRendered(html, sourceName) {
  const problems = [];
  if (html.includes("\u0000")) problems.push("unresolved inline-code placeholder");
  if (/\*\*[^*]+\*\*/.test(html)) problems.push("unrendered bold (**)");
  if (/^```/m.test(html) || html.includes("```")) problems.push("unrendered code fence");
  if (/(^|\n)\|/.test(html)) problems.push("unrendered table row");
  if (/(^|\n)- /.test(html)) problems.push("unrendered list item");
  if (/(^|\n)#{1,6} /.test(html)) problems.push("unrendered heading");
  if (problems.length > 0) {
    throw new Error(`${sourceName}: ${problems.join(", ")} — extend scripts/render-docs.mjs`);
  }
}

function page(title, body, depth) {
  const up = depth === 0 ? "" : "../";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Glyph Arena</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0 auto; max-width: 46rem; padding: 2rem 1.25rem 4rem;
         font: 16px/1.65 system-ui, -apple-system, "Segoe UI", sans-serif; }
  h1, h2, h3, h4 { line-height: 1.25; margin: 2rem 0 .75rem; }
  h1 { font-size: 1.6rem; }
  h2 { font-size: 1.25rem; }
  h3 { font-size: 1.05rem; }
  p, li { margin: .5rem 0; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
  pre { padding: .85rem 1rem; overflow-x: auto; border: 1px solid #8883; border-radius: .5rem; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { border: 1px solid #8883; padding: .4rem .6rem; text-align: left; }
  th { font-weight: 500; }
  a { color: #4d6bfe; }
  .nav { margin-bottom: 1.5rem; font-size: .9rem; }
</style>
</head>
<body>
<div class="nav"><a href="${up}index.html">← Glyph Arena</a> · <a href="${up}docs/index.html">All API docs</a></div>
${body}
</body>
</html>
`;
}

function main() {
  const files = readdirSync(DOCS_DIR).filter((name) => name.endsWith(".md")).sort();
  if (files.length === 0) {
    throw new Error(`no markdown found in ${DOCS_DIR}`);
  }

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const rendered = [];
  for (const file of files) {
    const sourcePath = join(DOCS_DIR, file);
    const markdown = readFileSync(sourcePath, "utf8");
    assertSupportedBlocks(markdown, file);
    const { html, meta } = renderMarkdown(markdown, sourcePath);
    checkRendered(html, file);

    const title = /^#\s+(.*)$/m.exec(readFileSync(sourcePath, "utf8"))?.[1] ?? file;
    const target = join(OUT_DIR, file.replace(/\.md$/, ".html"));
    writeFileSync(target, page(title, html, 1));
    rendered.push({ file, title, meta });
  }

  const list = rendered
    .map(
      ({ file, title }) =>
        `<li><a href="${file.replace(/\.md$/, ".html")}">${escapeHtml(title)}</a></li>`,
    )
    .join("\n");
  writeFileSync(
    join(OUT_DIR, "index.html"),
    page("API docs", `<h1>API docs</h1>\n<p>One page per package.</p>\n<ul>\n${list}\n</ul>`, 1),
  );

  const totals = rendered.reduce(
    (acc, { meta }) => ({
      headings: acc.headings + meta.headings,
      codeBlocks: acc.codeBlocks + meta.codeBlocks,
      tables: acc.tables + meta.tables,
      listItems: acc.listItems + meta.listItems,
    }),
    { headings: 0, codeBlocks: 0, tables: 0, listItems: 0 },
  );

  console.log(
    `rendered ${rendered.length} docs (+index) → examples/pickup-demo/public/docs ` +
      `[${totals.headings} headings, ${totals.tables} tables, ${totals.codeBlocks} code blocks, ${totals.listItems} list items]`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(`docs render failed: ${error.message}`);
    process.exit(1);
  }
}
