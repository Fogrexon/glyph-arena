import { escapeHtml } from "./escape.mjs";

/**
 * Page shell for the generated docs.
 *
 * `sidebar` is the full docs list (filename order, labels from each page's H1)
 * so every page can reach every other one; `sections` is the current page's
 * H2 outline; `current` marks the active entry.
 */
export function renderPage({ title, body, sidebar, sections = [], current = "" }) {
  const navItems = sidebar
    .map(({ href, label }) => {
      const active = href === current;
      const cls = active ? ' class="active"' : "";
      const mark = active ? ' aria-current="page"' : "";
      return `<li><a href="${href}"${cls}${mark}>${escapeHtml(label)}</a></li>`;
    })
    .join("\n");

  const tocItems = sections
    .map(({ id, text }) => `<li><a href="#${id}">${escapeHtml(text)}</a></li>`)
    .join("\n");
  const toc =
    sections.length > 0
      ? `<nav class="toc" aria-label="On this page">\n<p class="toc-title">On this page</p>\n<ul>\n${tocItems}\n</ul>\n</nav>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Glyph Arena</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.65 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .layout { display: grid; grid-template-columns: 1fr; gap: 2rem;
            max-width: 72rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
  @media (min-width: 52rem) { .layout { grid-template-columns: 15rem 1fr; } }
  .sidebar { font-size: .9rem; }
  .sidebar ul, .toc ul { list-style: none; margin: 0; padding: 0; }
  .sidebar li, .toc li { margin: .15rem 0; }
  .sidebar a { display: block; padding: .15rem .35rem; border-radius: .25rem; text-decoration: none; }
  .sidebar a.active { font-weight: 500; background: #4d6bfe1a; }
  .toc { margin: 0 0 2rem; padding-left: .75rem; border-left: 2px solid #8883; }
  .toc-title { margin: 0 0 .35rem; font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; }
  .toc a { text-decoration: none; }
  h1, h2, h3, h4 { line-height: 1.25; margin: 2rem 0 .75rem; scroll-margin-top: 1rem; }
  h1 { font-size: 1.6rem; margin-top: 0; }
  h2 { font-size: 1.25rem; }
  h3 { font-size: 1.05rem; }
  p, li { margin: .5rem 0; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
  pre { padding: .85rem 1rem; overflow-x: auto; border: 1px solid #8883; border-radius: .5rem; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { border: 1px solid #8883; padding: .4rem .6rem; text-align: left; }
  th { font-weight: 500; }
  a { color: #4d6bfe; }
  .top { margin-bottom: 1.5rem; font-size: .9rem; }
</style>
</head>
<body>
<div class="layout">
<nav class="sidebar" aria-label="All API docs">
<p class="toc-title">API docs</p>
<ul>
${navItems}
</ul>
</nav>
<main>
<div class="top"><a href="../index.html">← Glyph Arena</a></div>
${toc}
${body}
</main>
</div>
</body>
</html>
`;
}
