import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { assembleSite, galleryNav, injectNav, navMarkup, publishedExamples } from "./assemble-site.mjs";

/** A throwaway workspace of examples: one directory per sample, each with a built `dist/`. */
function workspace() {
  const root = mkdtempSync(join(tmpdir(), "glyph-nav-"));
  const examples = join(root, "examples");
  mkdirSync(examples, { recursive: true });

  const add = (dir, declared, { body = '<nav class="gallery-nav" data-glyph-nav></nav>' } = {}) => {
    mkdirSync(join(examples, dir, "dist"), { recursive: true });
    writeFileSync(
      join(examples, dir, "package.json"),
      JSON.stringify({ name: `@fogrexon/glyph-arena-${dir}`, glyphArenaPage: declared }),
    );
    writeFileSync(join(examples, dir, "dist", "index.html"), `<html><body>${body}</body></html>`);
  };

  // Two samples is the smallest world in which "one page links to another" means anything.
  add("home", { path: "", label: "Home" });
  add("race", { path: "/race/", label: "Race" });

  return { root, examples, add };
}

const worlds = [];
after(() => {
  for (const world of worlds) rmSync(world.root, { recursive: true, force: true });
});

function create() {
  const world = workspace();
  worlds.push(world);
  return world;
}

describe("publishedExamples", () => {
  it("reads the declaration, and puts the root page first however the directories are named", () => {
    const { examples } = create();

    assert.deepEqual(
      publishedExamples(examples).map((example) => [example.name, example.page, example.label]),
      [
        ["home", "", "Home"],
        ["race", "/race/", "Race"],
      ],
    );
  });

  it("skips an example that declares nothing — not published is a decision, not an accident", () => {
    const { examples, add } = create();
    add("scratch", undefined);

    assert.equal(publishedExamples(examples).length, 2);
  });

  it("refuses the old one-word declaration: the nav needs the label too", () => {
    const { examples, add } = create();
    add("wordonly", "/wordonly/");

    assert.throws(() => publishedExamples(examples), /must be \{ "path"/);
  });

  it("refuses two examples claiming the same page", () => {
    const { examples, add } = create();
    add("copy", { path: "/race/", label: "Copy" });

    assert.throws(() => publishedExamples(examples), /both claim the page/);
  });
});

describe("galleryNav / navMarkup", () => {
  it("links every declared page from the site base, then the docs", () => {
    const { examples } = create();
    const nav = galleryNav(publishedExamples(examples));

    assert.deepEqual(
      nav.map((item) => [item.label, item.href]),
      [
        ["Home", "/glyph-arena/"],
        ["Race", "/glyph-arena/race/"],
        ["API Docs", "/glyph-arena/docs/"],
      ],
    );
  });

  it("marks the page the reader is on, and only that one", () => {
    const { examples } = create();
    const nav = publishedExamples(examples);
    const markup = navMarkup(galleryNav(nav), "/race/");

    assert.equal(markup.match(/aria-current="page"/g)?.length, 1);
    assert.match(markup, /<a href="\/glyph-arena\/race\/" aria-current="page">Race<\/a>/);
    assert.match(markup, /<a href="\/glyph-arena\/">Home<\/a>/);
  });
});

describe("injectNav", () => {
  it("fills the placeholder where the page put it", () => {
    const { examples } = create();
    const nav = galleryNav(publishedExamples(examples));
    const html = injectNav('<body><nav class="gallery-nav" data-glyph-nav></nav></body>', nav, "");

    assert.match(html, /<nav class="gallery-nav" aria-label="Glyph Arena demos">/);
    assert.match(html, /<a href="\/glyph-arena\/" aria-current="page">Home<\/a>/);
    assert.equal(html.match(/data-glyph-nav/g), null, "the placeholder is gone");
  });

  it("adds the nav to a page that has none — the CAMP case", () => {
    const { examples } = create();
    const nav = galleryNav(publishedExamples(examples));
    // CAMP shipped with no nav element at all: four pages, zero links to it.
    const html = injectNav("<body><canvas></canvas></body>", nav, "/race/");

    assert.match(html, /<canvas><\/canvas>\s*<nav class="gallery-nav"/);
    assert.match(html, /aria-current="page">Race</);
  });

  it("throws rather than silently dropping the nav when there is no </body>", () => {
    assert.throws(() => injectNav("<html></html>", [], ""), /no <\/body>/);
  });
});

describe("assembleSite", () => {
  it("publishes every declared page, and the same nav on each", () => {
    const { root, examples } = create();
    const siteDir = join(root, "site");

    const copied = assembleSite({ examplesDir: examples, siteDir });

    assert.deepEqual(copied.map((entry) => entry.page), ["/", "/race/"]);
    for (const page of ["index.html", "race/index.html"]) {
      const html = readFileSync(join(siteDir, page), "utf8");
      assert.match(html, /href="\/glyph-arena\/race\/"/, `${page} links to the other sample`);
      assert.match(html, /href="\/glyph-arena\/docs\/"/, `${page} links to the docs`);
    }
  });

  it("follows a new sample into the build and the nav, with no edit to any other file", () => {
    // The acceptance for this unit, in miniature: add one declaration, and every page links to it.
    const { root, examples, add } = create();
    const siteDir = join(root, "site");

    add("third", { path: "/third/", label: "Third" });
    assembleSite({ examplesDir: examples, siteDir });

    for (const page of ["index.html", "race/index.html", "third/index.html"]) {
      assert.match(
        readFileSync(join(siteDir, page), "utf8"),
        /href="\/glyph-arena\/third\/"( aria-current="page")?>Third</,
        page,
      );
    }
  });

  it("refuses a gallery with no root page instead of publishing a site with no index", () => {
    const { root, examples, add } = create();
    rmSync(join(examples, "home"), { recursive: true, force: true });
    add("only", { path: "/only/", label: "Only" });

    assert.throws(() => assembleSite({ examplesDir: examples, siteDir: join(root, "site") }), /no root page/);
  });

  it("refuses a declared page that was never built", () => {
    const { root, examples } = create();
    rmSync(join(examples, "race", "dist"), { recursive: true, force: true });

    assert.throws(
      () => assembleSite({ examplesDir: examples, siteDir: join(root, "site") }),
      /race: no built index\.html/,
    );
  });
});
