import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

import { fogrexonImports, singleProgram, UMBRELLA_PACKAGE } from "./lib/markdown-program.mjs";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "..");
const SOURCE = "packages/glyph-arena/README.md";
const README = readFileSync(join(ROOT, "packages", "glyph-arena", "README.md"), "utf8");
const PAGE = readFileSync(join(ROOT, "fixtures", "readme", "index.html"), "utf8");

describe("the umbrella README's block, as a program", () => {
  it("extracts it without a heading — the README has one program", () => {
    const { code } = singleProgram(README, { source: SOURCE });

    assert.match(code, /^import \{/);
    assert.match(code, /\.start\(\);$/);
  });

  it("reports the line in the README where the block begins", () => {
    const { code, line } = singleProgram(README, { source: SOURCE });

    assert.equal(README.split(/\r?\n/)[line - 1], code.split("\n")[0]);
  });

  it("imports only the umbrella package", () => {
    const { code } = singleProgram(README, { source: SOURCE });

    assert.deepEqual(fogrexonImports(code), [UMBRELLA_PACKAGE]);
  });

  it("is the whole loop the README promises: a rectangle and text, no images", () => {
    const { code } = singleProgram(README, { source: SOURCE });

    for (const call of ["createDraw", "createLoop", "draw.clear", "draw.rect", "draw.text"]) {
      assert.ok(code.includes(call), `${call} is in the block`);
    }
    assert.doesNotMatch(code, /createAssets|\.sprite\(/, "no image loading in the first example");
  });

  it("has a page that provides exactly what it looks up", () => {
    const { code } = singleProgram(README, { source: SOURCE });

    assert.match(code, /querySelector<HTMLCanvasElement>\("#game"\)/);
    assert.match(PAGE, /<canvas id="game">/);
    assert.match(PAGE, /<script type="module" src="\.\/main\.ts">/);
  });
});

describe("the README extractor refuses to guess", () => {
  it("fails on two ts blocks — the reader would not know which to copy either", () => {
    const doc = `# Title\n\n\`\`\`ts\n${'import { createLoop } from "@fogrexon/glyph-arena";'}\n\`\`\`\n\n\`\`\`ts\n${'import { createDraw } from "@fogrexon/glyph-arena";'}\n\`\`\`\n`;

    assert.throws(() => singleProgram(doc, { source: "README.md" }), /has 2 ```ts blocks/);
  });

  it("fails on a subpackage import, because npm does not have it", () => {
    const doc = '```ts\nimport { createLoop } from "@fogrexon/glyph-arena-loop";\n```\n';

    assert.throws(() => singleProgram(doc, { source: "README.md" }), /imports @fogrexon\/glyph-arena-loop/);
  });

  it("fails when the umbrella import is missing", () => {
    const doc = "```ts\nconsole.log(1);\n```\n";

    assert.throws(() => singleProgram(doc, { source: "README.md" }), /never imports "@fogrexon\/glyph-arena"/);
  });

  it("fails on an empty block", () => {
    assert.throws(() => singleProgram("```ts\n\n```\n", { source: "README.md" }), /is empty/);
  });

  it("fails on an unclosed fence instead of swallowing the rest of the page", () => {
    const doc = '```ts\nimport { createLoop } from "@fogrexon/glyph-arena";\n';

    assert.throws(() => singleProgram(doc, { source: "README.md" }), /is never closed/);
  });

  it("fails when a heading was asked for and is gone", () => {
    assert.throws(
      () => singleProgram("# Title\n", { heading: "## The whole file", source: "README.md" }),
      /no "## The whole file" heading/,
    );
  });
});
