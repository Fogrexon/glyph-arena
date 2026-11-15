/**
 * Minimal markdown → HTML for `docs/*.md`.
 *
 * Scope is deliberate: headings, paragraphs, unordered lists, tables, fenced
 * code, inline code, bold and links — everything the docs actually use.
 * `assertSupportedBlocks()` rejects anything else so a doc that grows a new
 * construct fails the build instead of shipping half-rendered markdown.
 */
import { escapeHtml } from "./escape.mjs";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const REPO = resolve(import.meta.dirname, "../..");
const GITHUB_BLOB = "https://github.com/Fogrexon/glyph-arena/blob/main";
const INLINE_CODE = /`([^`]+)`/g;
const PLACEHOLDER = String.fromCharCode(0);

const UNSUPPORTED = [
  [/^\s*>/, "blockquote (>)"],
  [/^\s*\d+\.\s/, "ordered list (1.)"],
  [/^\s*[*+]\s/, "bullet list (* or +)"],
  [/^\s*!\[/, "image (![])"],
  [/^\s*(-{3,}|\*{3,}|_{3,})\s*$/, "thematic break (---)"],
  [/^\s{2,}\S/, "indented continuation"],
  [/^\s*<[a-zA-Z]/, "raw html"],
  [/^\s*\[[^\]]+\]:/, "reference link definition"],
];

export function assertSupportedBlocks(markdown, sourceName) {
  const unsupported = [];
  let inFence = false;

  for (const line of markdown.split("\n")) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const [pattern, label] of UNSUPPORTED) {
      if (pattern.test(line)) unsupported.push(`${label}: ${line.trim().slice(0, 60)}`);
    }
  }

  if (unsupported.length > 0) {
    throw new Error(
      `${sourceName}: unsupported markdown block(s) — extend scripts/docs/markdown.mjs:\n  ` +
        unsupported.slice(0, 5).join("\n  "),
    );
  }
}

export function checkRendered(html, sourceName) {
  const problems = [];
  if (html.includes(PLACEHOLDER)) problems.push("unresolved inline-code placeholder");
  if (/\*\*[^*]+\*\*/.test(html)) problems.push("unrendered bold (**)");
  if (html.includes("```")) problems.push("unrendered code fence");
  if (/(^|\n)\|/.test(html)) problems.push("unrendered table row");
  if (/(^|\n)- /.test(html)) problems.push("unrendered list item");
  if (/(^|\n)#{1,6} /.test(html)) problems.push("unrendered heading");
  if (problems.length > 0) {
    throw new Error(`${sourceName}: ${problems.join(", ")} — extend scripts/docs/markdown.mjs`);
  }
}

/** `docs/api-x.md` → `api-x.html`; repo files → GitHub blob; others untouched. */
function rewriteHref(href, sourceDoc) {
  if (/^https?:|^#|^mailto:/.test(href)) return href;

  const [pathPart, hash = ""] = href.split("#");
  if (!pathPart.endsWith(".md")) return href;

  const suffix = hash ? `#${hash}` : "";
  const base = pathPart.slice(pathPart.lastIndexOf("/") + 1);
  if (pathPart.startsWith("docs/") || pathPart.startsWith("./")) {
    return `${base.replace(/\.md$/, ".html")}${suffix}`;
  }

  const repoPath = resolve(dirname(sourceDoc), pathPart);
  if (!repoPath.startsWith(REPO)) return href;
  return `${GITHUB_BLOB}/${repoPath.slice(REPO.length + 1)}${suffix}`;
}

function renderInline(text, sourceDoc) {
  const codeSpans = [];
  let out = text.replace(INLINE_CODE, (_, code) => {
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return `${PLACEHOLDER}${codeSpans.length - 1}${PLACEHOLDER}`;
  });

  out = escapeHtml(out);
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_, label, href) => `<a href="${escapeHtml(rewriteHref(href, sourceDoc))}">${label}</a>`,
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(
    new RegExp(`${PLACEHOLDER}(\\d+)${PLACEHOLDER}`, "g"),
    (_, index) => codeSpans[Number(index)],
  );
  return out;
}

function splitCells(line) {
  return line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(rows, sourceDoc) {
  const [header, , ...body] = rows;
  const head = splitCells(header)
    .map((cell) => `<th>${renderInline(cell, sourceDoc)}</th>`)
    .join("");
  const bodyRows = body
    .map(
      (row) =>
        `<tr>${splitCells(row)
          .map((cell) => `<td>${renderInline(cell, sourceDoc)}</td>`)
          .join("")}</tr>`,
    )
    .join("\n");
  return `<table>\n<thead><tr>${head}</tr></thead>\n<tbody>${bodyRows}</tbody>\n</table>`;
}

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
      out.push(`<pre><code${language}>${escapeHtml(body.join("\n"))}</code></pre>`);
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

    if (/^\|/.test(line) && /^\|[\s:-]+\|/.test(lines[index + 1] ?? "")) {
      const rows = [];
      while (index < lines.length && /^\|/.test(lines[index])) {
        rows.push(lines[index]);
        index += 1;
      }
      meta.tables += 1;
      out.push(renderTable(rows, sourceDoc));
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

export function titleOf(sourcePath, fallback) {
  const match = /^#\s+(.*)$/m.exec(readFileSync(sourcePath, "utf8"));
  return match?.[1]?.trim() ?? fallback;
}
