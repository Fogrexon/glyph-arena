import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

import {
  fogrexonImports,
  UMBRELLA_PACKAGE,
  wholeFilePhoneProgram,
  wholeFileProgram,
  WHOLE_FILE_HEADING,
  WHOLE_FILE_PHONE_HEADING,
} from "./lib/tutorial.mjs";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "..");
const TUTORIAL = readFileSync(join(ROOT, "docs", "tutorial.md"), "utf8");

/** The smallest document the extractor accepts, so each test can break exactly one thing. */
const documentWith = (block, { heading = WHOLE_FILE_HEADING, before = "", after = "" } = {}) =>
  [before, heading, "", "Some prose.", "", block, "", after].join("\n");

const program = (body = 'import { createLoop } from "@fogrexon/glyph-arena";\ncreateLoop({});') =>
  `\`\`\`ts\n${body}\n\`\`\``;

describe("the tutorial's whole file, as a program", () => {
  it("extracts the block from docs/tutorial.md", () => {
    const { code } = wholeFileProgram(TUTORIAL);

    assert.match(code, /^import \{/, "the block starts with its imports");
    assert.match(code, /from "@fogrexon\/glyph-arena"/);
    assert.match(code, /\.start\(\);$/, "the block ends by starting the loop");
  });

  it("reports the line in the tutorial where the block begins", () => {
    const { code, line } = wholeFileProgram(TUTORIAL);
    const lines = TUTORIAL.split(/\r?\n/);

    assert.equal(lines[line - 1], code.split("\n")[0]);
  });

  it("imports only the umbrella package — the one thing npm publishes", () => {
    const { code } = wholeFileProgram(TUTORIAL);

    assert.deepEqual(fogrexonImports(code), [UMBRELLA_PACKAGE]);
  });

  it("is the program the tutorial's prose describes (the pieces it promises)", () => {
    const { code } = wholeFileProgram(TUTORIAL);

    for (const name of ["createBody", "createTileMap", "stepBody", "tagIn", "createCamera"]) {
      assert.ok(code.includes(name), `${name} is used in the block`);
    }
    // The two lines the prose says carry more weight than they look like.
    assert.match(code, /const dt = Math\.min\(delta, 1 \/ 30\)/);
    assert.match(code, /const jump = jumpHeld && !jumpWasHeld/);
  });
});

describe("the extractor refuses to guess", () => {
  it("fails when the heading is gone, and names it", () => {
    assert.throws(
      () => wholeFileProgram(documentWith(program(), { heading: "## The entire file" })),
      new RegExp(`no "${WHOLE_FILE_HEADING}" heading`),
    );
  });

  it("fails when the section has no ts block", () => {
    assert.throws(
      () => wholeFileProgram(documentWith("```js\nconsole.log(1);\n```")),
      /has no ```ts block/,
    );
  });

  it("fails on two ts blocks — the reader would not know which to copy either", () => {
    const block = `${program()}\n\n${program()}`;

    assert.throws(() => wholeFileProgram(documentWith(block)), /has 2 ```ts blocks/);
  });

  it("fails on an unclosed fence instead of swallowing the rest of the page", () => {
    assert.throws(
      () => wholeFileProgram(documentWith('```ts\nimport { createLoop } from "@fogrexon/glyph-arena";')),
      /is never closed/,
    );
  });

  it("fails on an empty block", () => {
    assert.throws(() => wholeFileProgram(documentWith("```ts\n\n```")), /is empty/);
  });

  it("fails on a subpackage import, because npm does not have it", () => {
    const body = 'import { createLoop } from "@fogrexon/glyph-arena-loop";';

    assert.throws(
      () => wholeFileProgram(documentWith(program(body))),
      /imports @fogrexon\/glyph-arena-loop; only "@fogrexon\/glyph-arena" is published/,
    );
  });

  it("fails when the umbrella import is missing altogether", () => {
    assert.throws(
      () => wholeFileProgram(documentWith(program('const value = 1;\nconsole.log(value);'))),
      /never imports "@fogrexon\/glyph-arena"/,
    );
  });

  it("stops at the next heading, so a later section's ts block is not it", () => {
    const doc = [
      WHOLE_FILE_HEADING,
      "",
      program(),
      "",
      "## Appendix",
      "",
      "```ts",
      'import { createLoop } from "@fogrexon/glyph-arena";',
      "// a different program",
      "```",
    ].join("\n");

    const { code } = wholeFileProgram(doc);

    assert.doesNotMatch(code, /a different program/);
  });
});

describe("the tutorial's phone program", () => {
  const phoneProgram = () =>
    program(
      [
        'import { createTouchControls, fitToWindow, measureCanvas, toCanvasPoint } from "@fogrexon/glyph-arena";',
        "// the same game, driven by a thumb",
        "canvas.addEventListener(\"touchstart\", () => {});",
      ].join("\n"),
    );

  it("extracts the block under its own heading, and reports the line", () => {
    const doc = documentWith(phoneProgram(), { heading: WHOLE_FILE_PHONE_HEADING });
    const { code, line } = wholeFilePhoneProgram(doc);

    assert.match(code, /createTouchControls/);
    assert.equal(doc.split(/\r?\n/)[line - 1], code.split("\n")[0]);
  });

  it("fails when the heading is gone, and names it", () => {
    assert.throws(
      () => wholeFilePhoneProgram(documentWith(phoneProgram(), { heading: "## Phones" })),
      new RegExp(`no "${WHOLE_FILE_PHONE_HEADING}" heading`),
    );
  });

  it("refuses a second ts block, exactly like the desktop program", () => {
    assert.throws(
      () => wholeFilePhoneProgram(documentWith(`${phoneProgram()}\n\n${phoneProgram()}`, { heading: WHOLE_FILE_PHONE_HEADING })),
      /has 2 ```ts blocks/,
    );
  });

  it("is in docs/tutorial.md and uses the four things only a phone needs", () => {
    const { code } = wholeFilePhoneProgram(TUTORIAL);

    assert.deepEqual(fogrexonImports(code), [UMBRELLA_PACKAGE]);
    for (const name of ["createTouchControls", "fitToWindow", "measureCanvas", "toCanvasPoint"]) {
      assert.ok(code.includes(name), `${name} is used in the phone program`);
    }
    assert.match(code, /pad\.controls\.update\(/, "it feeds the pad it draws, every frame");
    assert.match(code, /createInput|touch(start|move|end|cancel)|pointer(down|move|up)/, "it collects the fingers itself");
  });

  it("is a different program from the desktop one, not a copy", () => {
    const desktop = wholeFileProgram(TUTORIAL).code;
    const phone = wholeFilePhoneProgram(TUTORIAL).code;

    assert.notEqual(phone, desktop);
    assert.match(phone, /createTouchControls/, "the second program is the one with the pad");
  });
});
