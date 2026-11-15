import { escapeHtml } from "./escape.mjs";

const UP = "../";

const STYLE = `  :root { color-scheme: light dark; }
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
  .nav { margin-bottom: 1.5rem; font-size: .9rem; }`;

/**
 * Wraps rendered doc HTML in the shared page shell.
 * Pages under `dist/docs/` reach the site root and the docs index with `../`.
 */
export function renderPage(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Glyph Arena</title>
<style>
${STYLE}
</style>
</head>
<body>
<div class="nav"><a href="${UP}index.html">← Glyph Arena</a> · <a href="${UP}docs/index.html">All API docs</a></div>
${body}
</body>
</html>
`;
}
