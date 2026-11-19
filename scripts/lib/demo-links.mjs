/**
 * The demos a reader can open, derived from the same declarations the deploy publishes from.
 *
 * The README's table is the first thing a visitor clicks, and it is also the last thing anyone
 * updates: a sample renamed in `package.json` leaves a link to a 404 and nothing goes red. So the
 * table is read back against `glyphArenaPage`, which is what `assemble-site.mjs` copies into the
 * published tree — one declaration, two readers (the nav and this table).
 *
 * No network here on purpose: fetching fogrexon.github.io in a unit test would make the suite red
 * when the network is, and would say nothing about whether the *deploy* publishes the page. That
 * second half is already checked where it can be measured — `check-served-bundles.mjs` compares
 * every built page with the bundle the live page names.
 */
import { EXTRA_NAV, publishedExamples } from "../assemble-site.mjs";
// The origin and path the deploy verifies against, not a second copy of them: `check-served-bundles`
// is what knows where the site lives, and a test that guessed a different host would pass here and
// say nothing about the links a reader clicks.
import { DEFAULT_BASE } from "../check-served-bundles.mjs";

/** The heading the table lives under. One name, used by the test and the reader alike. */
export const SECTION = "Play it";

/**
 * Every page a reader is offered: each example that declares `glyphArenaPage`, then the docs.
 *
 * `name` is the directory under `examples/` (absent for pages that are not a sample), so a test
 * can also ask "does this sample's own README point at its page?".
 */
export function demoPages(examplesDir, siteBase = DEFAULT_BASE) {
  const base = siteBase.endsWith("/") ? siteBase : `${siteBase}/`;

  const examples = publishedExamples(examplesDir).map((example) => ({
    name: example.name,
    label: example.label,
    page: example.page,
    url: `${base}${example.page.replace(/^\//, "")}`,
  }));

  const extra = EXTRA_NAV.map((item) => ({
    name: null,
    label: item.label,
    page: item.page,
    url: `${base}${item.page.replace(/^\//, "")}`,
  }));

  return [...examples, ...extra];
}

/** The markdown under `## Play it`, or null when the section is missing (empty is a different bug). */
export function playSection(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^##\\s+${SECTION}\\s*$`, "i").test(line));
  if (start === -1) return null;

  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    body.push(line);
  }

  return body.join("\n");
}

/** Every `[label](http(s)://…)` in a piece of markdown, in order. */
export function linksIn(markdown) {
  return [...markdown.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)].map((match) => ({
    label: match[1].trim(),
    url: match[2],
  }));
}

/** The links in the README's `## Play it` table; `null` when the section is absent. */
export function demoLinksIn(markdown) {
  const section = playSection(markdown);
  return section === null ? null : linksIn(section);
}
