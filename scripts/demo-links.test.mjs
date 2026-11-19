/**
 * The README's demo table, read back against the pages the deploy publishes.
 *
 * Why a test and not a one-off check: a sample that is renamed, unpublished, or added leaves the
 * table pointing at nothing, and the table is a link a visitor clicks before anything else. The
 * list it is compared with is `glyphArenaPage` in each example's `package.json` — the same field
 * `assemble-site.mjs` copies into `site/` — so adding a sample without a row here is red, and a row
 * for a page nobody publishes is red too. The reverse cases at the bottom keep the predicate from
 * quietly matching everything.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

import { demoLinksIn, demoPages, linksIn, playSection } from "./lib/demo-links.mjs";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "..");
const README = readFileSync(join(ROOT, "README.md"), "utf8");
const PAGES = demoPages(join(ROOT, "examples"));

const links = demoLinksIn(README) ?? [];
const urls = new Set(links.map((link) => link.url));

describe("the README's demo table", () => {
  it("exists, and is not a table with nothing in it", () => {
    const section = playSection(README);

    assert.notEqual(section, null, "no `## Play it` section in README.md");
    assert.ok(links.length >= PAGES.length, `the table has ${links.length} links for ${PAGES.length} pages`);
  });

  it("offers every page the deploy publishes, under the label the nav uses", () => {
    for (const page of PAGES) {
      const link = links.find((candidate) => candidate.url === page.url);

      assert.ok(link, `${page.url} is published but not linked from the README's table`);
      assert.equal(link.label, page.label, `${page.url} is labelled "${link.label}", the nav says "${page.label}"`);
    }
  });

  it("links nothing that is not published — a dead demo is a 404, not a sample", () => {
    const published = new Set(PAGES.map((page) => page.url));

    for (const link of links) {
      assert.ok(published.has(link.url), `the table links ${link.url}, which no example declares`);
    }
  });
});

describe("each sample's own README", () => {
  for (const page of PAGES.filter((candidate) => candidate.name !== null)) {
    it(`${page.name}/README.md points at ${page.url}`, () => {
      const readme = readFileSync(join(ROOT, "examples", page.name, "README.md"), "utf8");

      assert.ok(readme.includes(page.url), `examples/${page.name}/README.md never links ${page.url}`);
    });
  }
});

describe("the check itself", () => {
  // A predicate that matches everything passes the tests above for the wrong reason: the README
  // could link a page nobody publishes and both of them would agree.
  const section = (body) => `# x\n\n## Play it\n\n| Sample |\n| --- |\n${body}\n\n## Next\n`;

  it("finds the links in the section and stops at the next heading", () => {
    const found = demoLinksIn(section("| [Camp](https://example.test/camp/) |"));

    assert.deepEqual(found, [{ label: "Camp", url: "https://example.test/camp/" }]);
    assert.deepEqual(demoLinksIn("# x\n\n## Play it\n\nnothing here\n\n## Next\n[far](https://far.test/)"), []);
    assert.equal(demoLinksIn("# x\n\n## Elsewhere\n"), null);
  });

  it("would miss a row for a page that is published", () => {
    const text = section("| [Pickup](https://fogrexon.github.io/glyph-arena/) |");

    for (const page of PAGES.filter((candidate) => candidate.page !== "")) {
      assert.equal(
        demoLinksIn(text).some((link) => link.url === page.url),
        false,
        `${page.url} must not look linked when the table only has one row`,
      );
    }
  });

  it("would flag a row for a page nobody declares", () => {
    const text = section("| [Ghost](https://fogrexon.github.io/glyph-arena/ghost/) |");
    const published = new Set(PAGES.map((page) => page.url));

    assert.deepEqual(
      linksIn(playSection(text)).filter((link) => !published.has(link.url)),
      [{ label: "Ghost", url: "https://fogrexon.github.io/glyph-arena/ghost/" }],
    );
  });
});
