import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

import { sectionBlocks } from "./lib/markdown-program.mjs";
import { PHONE_HEADING, tutorialPadBlock } from "./lib/tutorial.mjs";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "..");
const TUTORIAL = readFileSync(join(ROOT, "docs", "tutorial.md"), "utf8");

describe("the phone section's pad block", () => {
  it("is the only block in the section that builds zones", () => {
    const blocks = sectionBlocks(TUTORIAL, { heading: PHONE_HEADING, source: "docs/tutorial.md" });
    const zoneBlocks = blocks.filter((block) => block.code.includes("createTouchControls"));

    assert.equal(blocks.length, 4, "the section is still four snippets");
    assert.equal(zoneBlocks.length, 1);
  });

  it("derives the square size from the width — the fix for the overlap", () => {
    const { code } = tutorialPadBlock(TUTORIAL);

    assert.match(code, /const size = Math\.min\(120, Math\.floor\(/, "size comes from the width");
    assert.doesNotMatch(code, /const size = 120/, "a constant size is the bug: 3×120 + margins = 432px");
  });

  it("declares the three zones the frame reads (left, right, jump)", () => {
    const { code } = tutorialPadBlock(TUTORIAL);

    for (const zone of ["left", "right", "jump"]) {
      assert.match(code, new RegExp(`(^|[\\s,{])${zone}: \\{ kind: "rect"`), `${zone} is a rect zone`);
    }
  });

  it("reports the line it starts on, so a failure points at the tutorial", () => {
    const { code, line } = tutorialPadBlock(TUTORIAL);

    assert.equal(TUTORIAL.split(/\r?\n/)[line - 1], code.split("\n")[0]);
  });
});

describe("the pad extractor refuses to guess", () => {
  const doc = (...blocks) => [PHONE_HEADING, "", ...blocks.flatMap((block) => [block, ""])].join("\n");

  it("fails when the section has no zone block", () => {
    assert.throws(
      () => tutorialPadBlock(doc("```ts\nconst x = 1;\n```"), "docs/tutorial.md"),
      /has 0 ```ts blocks that call createTouchControls/,
    );
  });

  it("fails when two blocks claim createTouchControls", () => {
    const block = '```ts\nfunction buildPad(width: number) {\n  return createTouchControls({ zones: {} });\n}\n```';

    assert.throws(() => tutorialPadBlock(doc(block, block), "docs/tutorial.md"), /has 2 ```ts blocks/);
  });

  it("fails when the block does not define buildPad", () => {
    const block = '```ts\nconst pad = createTouchControls({ zones: {} });\n```';

    assert.throws(() => tutorialPadBlock(doc(block), "docs/tutorial.md"), /does not define buildPad/);
  });

  it("fails when the heading is gone", () => {
    assert.throws(
      () => tutorialPadBlock(`## Another section\n\n`, "docs/tutorial.md"),
      /no "## On a phone" heading/,
    );
  });
});
