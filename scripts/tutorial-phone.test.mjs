import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

import {
  MAX_SEGMENTS,
  phonePair,
  splitProgramSegments,
  wholeFilePhoneProgram,
} from "./lib/tutorial.mjs";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "..");
const TUTORIAL = readFileSync(join(ROOT, "docs", "tutorial.md"), "utf8");

describe("the two whole files", () => {
  it("differ only inside the marked segments", () => {
    const pair = phonePair(TUTORIAL);

    assert.ok(
      pair.sameOutside,
      "everything outside `// phone-begin` / `// phone-end` must be byte for byte the same in both programs",
    );
  });

  it("mark their differences, and there are not more than one program's worth", () => {
    const pair = phonePair(TUTORIAL);

    assert.ok(pair.desktopSegments.length > 0, "the desktop program marks where the phone one differs");
    assert.equal(
      pair.desktopSegments.length,
      pair.phoneSegments.length,
      "both programs mark the same number of places",
    );
    assert.ok(
      pair.phoneSegments.length <= MAX_SEGMENTS,
      `${pair.phoneSegments.length} segments is more than the ${MAX_SEGMENTS} one program can carry`,
    );
  });

  it("actually differ — a copy with no phone wiring is not the phone version", () => {
    const pair = phonePair(TUTORIAL);

    assert.notEqual(pair.desktop.code, pair.phone.code);
    assert.ok(pair.phoneSegments.every((segment) => segment.code.trim() !== ""), "no empty segment");
  });
});

describe("the phone program's pad", () => {
  const { code } = wholeFilePhoneProgram(TUTORIAL);

  it("derives the square size from the width — the fix for the overlap", () => {
    assert.match(code, /const size = Math\.min\(120, Math\.floor\(/, "size comes from the width");
    assert.doesNotMatch(code, /const size = 120/, "a constant size is the bug: 3×120 + margins = 432px");
  });

  it("declares the three zones the frame reads (left, right, jump)", () => {
    for (const zone of ["left", "right", "jump"]) {
      assert.match(code, new RegExp(`(^|[\\s,{])${zone}: \\{ kind: "rect"`), `${zone} is a rect zone`);
    }
  });

  it("is the pad the game reads and the pad it draws — one object, not two", () => {
    assert.match(code, /return \{ zones, controls: createTouchControls\(/, "zones and controls come back together");
    assert.match(code, /pad\.controls\.update\(/, "the frame feeds that pad");
  });
});

describe("the segment splitter refuses to guess", () => {
  it("fails when a segment is never closed", () => {
    assert.throws(
      () => splitProgramSegments('const a = 1;\n// phone-begin\nconst b = 2;\n', "program.ts"),
      /is never closed/,
    );
  });

  it("fails when an end has no begin", () => {
    assert.throws(() => splitProgramSegments("const a = 1;\n// phone-end\n", "program.ts"), /never opened/);
  });

  it("fails when a segment opens inside another", () => {
    assert.throws(
      () => splitProgramSegments("// phone-begin\n// phone-begin\n// phone-end\n", "program.ts"),
      /opens inside the segment/,
    );
  });

  it("keeps the outside, the segments and their names", () => {
    const { outside, segments } = splitProgramSegments(
      ["const a = 1;", "// phone-begin: pad", "const b = 2;", "// phone-end", "const c = 3;"].join("\n"),
      "program.ts",
    );

    assert.equal(outside, "const a = 1;\nconst c = 3;");
    assert.deepEqual(segments.map((segment) => segment.name), ["pad"]);
    assert.equal(segments[0].code, "const b = 2;");
  });

  it("stops a fifth segment, because that is a second program", () => {
    const five = Array.from({ length: MAX_SEGMENTS + 1 }, (_, index) =>
      [`// phone-begin: s${index}`, `const v${index} = ${index};`, "// phone-end"].join("\n"),
    ).join("\n");
    const doc = [
      "## The whole file",
      "",
      "```ts",
      'import { createLoop } from "@fogrexon/glyph-arena";',
      "// phone-begin: shared",
      "const shared = 1;",
      "// phone-end",
      five,
      "```",
      "",
      "## The whole file, on a phone",
      "",
      "```ts",
      'import { createLoop } from "@fogrexon/glyph-arena";',
      "// phone-begin: shared",
      "const shared = 1;",
      "// phone-end",
      five,
      "```",
    ].join("\n");

    assert.throws(() => phonePair(doc, "docs/tutorial.md"), /is a second program/);
  });
});
