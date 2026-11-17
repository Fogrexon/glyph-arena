import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { bundlesInHtml, comparePage, pageUrl, pagesInSite } from "./check-served-bundles.mjs";

const html = (bundle) => `<!doctype html><html><head><script type="module" src="/assets/${bundle}"></script></head></html>`;

describe("bundlesInHtml", () => {
  it("finds the one bundle a built page names", () => {
    assert.deepEqual(bundlesInHtml(html("index-DkHk2PrC.js")), ["index-DkHk2PrC.js"]);
  });

  it("reports a page that names none, and a page that names two", () => {
    assert.deepEqual(bundlesInHtml("<html></html>"), []);
    assert.deepEqual(
      bundlesInHtml(`${html("index-AAAA.js")}${html("index-BBBB.js")}`).sort(),
      ["index-AAAA.js", "index-BBBB.js"],
    );
  });

  it("does not mistake a source map or an unrelated chunk for the bundle", () => {
    assert.deepEqual(bundlesInHtml('<script src="/assets/other-123.js"></script>'), []);
  });
});

describe("pageUrl", () => {
  it("puts the root demo at the base and the others under their path", () => {
    assert.equal(pageUrl("https://example.test/glyph-arena", ""), "https://example.test/glyph-arena/");
    assert.equal(pageUrl("https://example.test/glyph-arena/", "/parry/"), "https://example.test/glyph-arena/parry/");
    assert.equal(pageUrl("https://example.test/glyph-arena", "runner/"), "https://example.test/glyph-arena/runner/");
  });
});

describe("comparePage", () => {
  const base = "https://example.test/glyph-arena";

  it("passes when the page serves the bundle this build produced", () => {
    const result = comparePage({ page: "/parry/", built: "index-AAAA.js", servedHtml: html("index-AAAA.js"), base });

    assert.equal(result.ok, true, result.detail);
    assert.match(result.detail, /index-AAAA\.js/);
  });

  it("fails when the page serves an older bundle, and says which", () => {
    const result = comparePage({ page: "/parry/", built: "index-AAAA.js", servedHtml: html("index-OLD.js"), base });

    assert.equal(result.ok, false);
    assert.match(result.detail, /serves index-OLD\.js, the build made index-AAAA\.js/);
  });

  it("fails when the page is not a single deploy", () => {
    const result = comparePage({ page: "", built: "index-AAAA.js", servedHtml: html("index-AAAA.js") + html("index-BBBB.js"), base });

    assert.equal(result.ok, false);
    assert.match(result.detail, /serves 2 bundles/);
  });
});

describe("pagesInSite", () => {
  it("finds every page in the built tree, with the bundle each one names", () => {
    const dir = mkdtempSync(join(tmpdir(), "ga-site-"));
    mkdirSync(join(dir, "parry", "assets"), { recursive: true });
    writeFileSync(join(dir, "index.html"), html("index-ROOT.js"));
    writeFileSync(join(dir, "parry", "index.html"), html("index-PARRY.js"));
    mkdirSync(join(dir, "docs"));
    writeFileSync(join(dir, "docs", "index.html"), "<html>no bundle</html>");

    const found = pagesInSite(dir);

    // Shallowest first, so the site root is the first line of the log.
    assert.deepEqual(found.map((entry) => entry.page), ["/", "/docs/", "/parry/"]);
    assert.deepEqual(found.map((entry) => entry.bundles), [["index-ROOT.js"], [], ["index-PARRY.js"]]);
  });
});
