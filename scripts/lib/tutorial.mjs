/**
 * The tutorial's "The whole file" program.
 *
 * That block is the only path a reader outside this repo walks: they copy it, import
 * `@fogrexon/glyph-arena`, and expect it to run. It lived only inside a Markdown fence until the
 * gate in `fixtures/tutorial` made it the source of a compiled package, so `pnpm -r typecheck`
 * never saw it — and two breakages reached readers that way (a spawn inside the floor, and `jump`
 * fed the held state instead of the press). Both compiled.
 *
 * The extraction itself is in `markdown-program.mjs`, because the umbrella `README.md` makes the
 * same promise and uses the same rules.
 */

import { singleProgram } from "./markdown-program.mjs";

export { UMBRELLA_PACKAGE, fogrexonImports } from "./markdown-program.mjs";

/** The heading whose section holds the block. One string, because the error message names it. */
export const WHOLE_FILE_HEADING = "## The whole file";

/**
 * The phone version of that program: the same game, driven by a pad instead of a keyboard.
 *
 * It is a separate, complete program rather than a diff, because the phone section's other blocks
 * are inserts into the program above and cannot be compiled on their own — which meant the three
 * things that only go wrong on a phone (`fitToWindow`'s resize hook, `measureCanvas` and
 * `toCanvasPoint`) were described in the tutorial and checked by nothing.
 */
export const WHOLE_FILE_PHONE_HEADING = "## The whole file, on a phone";

/** The prose section the phone wiring is explained in; its snippets are not compiled here. */
export const PHONE_HEADING = "## On a phone";

/**
 * The program the tutorial tells people to copy, plus where it starts, so a compiler error can be
 * reported against `docs/tutorial.md` instead of a generated file nobody edits.
 */
export function wholeFileProgram(markdown, source = "docs/tutorial.md") {
  return singleProgram(markdown, { heading: WHOLE_FILE_HEADING, source });
}

/**
 * The phone program: the block the reader copies when they want the game on a phone.
 *
 * Same rules as the desktop block — one `ts` fence, umbrella import only — because it is copied by
 * the same reader into the same empty project, and the fixture compiles and runs it the same way.
 */
export function wholeFilePhoneProgram(markdown, source = "docs/tutorial.md") {
  return singleProgram(markdown, { heading: WHOLE_FILE_PHONE_HEADING, source });
}

/**
 * The markers the two programs use to say where they differ.
 *
 * A phone version of the whole file is a second copy of a program, and two copies drift: today it is
 * the resize hook, tomorrow the jump edge, and nothing notices because both compile. So every
 * difference is inside a marked segment, and everything outside them has to be byte for byte the
 * same. The check compares the outside; a segment that grows is a segment, a fifth one is a second
 * program (`maxSegments`).
 *
 * A segment may carry a name — `// phone-begin: pad` — so the next person sees what it is for. The
 * name is optional here only because the markers landed before the names did.
 */
export const SEGMENT_BEGIN = "// phone-begin";
export const SEGMENT_END = "// phone-end";

/** 4 is the most that is still "the same program with phone wiring"; 5 means it is a second one. */
export const MAX_SEGMENTS = 4;

const BEGIN = /^\s*\/\/\s*phone-begin\s*(?::\s*(.*?))?\s*$/;
const END = /^\s*\/\/\s*phone-end\s*$/;

/**
 * One program split into what is shared and what is phone-only.
 *
 * Returns the text with every segment removed (the part both programs must agree on), plus the
 * segments themselves, in order, with their names when they have one.
 */
export function splitProgramSegments(code, source = "program.ts") {
  const lines = code.split("\n");
  const outside = [];
  const segments = [];

  let open = null;

  lines.forEach((line, index) => {
    const begin = BEGIN.exec(line);
    if (begin !== null) {
      if (open !== null) {
        throw new Error(
          `${source}:${index + 1}: a "${SEGMENT_BEGIN}" opens inside the segment that started on line ${open.line}`,
        );
      }

      open = { line: index + 1, name: begin[1] ?? null, body: [] };
      return;
    }

    if (END.test(line)) {
      if (open === null) {
        throw new Error(`${source}:${index + 1}: "${SEGMENT_END}" closes a segment that was never opened`);
      }

      segments.push({ name: open.name, line: open.line, code: open.body.join("\n") });
      open = null;
      return;
    }

    if (open === null) outside.push(line);
    else open.body.push(line);
  });

  if (open !== null) {
    throw new Error(`${source}:${open.line}: the "${SEGMENT_BEGIN}" segment is never closed`);
  }

  return { outside: outside.join("\n"), segments };
}

/**
 * The two programs, and the promise the tutorial makes about them: same outside, differences only
 * in marked segments.
 */
export function phonePair(markdown, source = "docs/tutorial.md") {
  const desktop = wholeFileProgram(markdown, source);
  const phone = wholeFilePhoneProgram(markdown, source);

  const left = splitProgramSegments(desktop.code, `${source}:${desktop.line}`);
  const right = splitProgramSegments(phone.code, `${source}:${phone.line}`);

  for (const [side, segments] of [
    ["The whole file", left.segments],
    ["The whole file, on a phone", right.segments],
  ]) {
    if (segments.length > MAX_SEGMENTS) {
      throw new Error(
        `${source}: "${side}" has ${segments.length} phone segments; ${MAX_SEGMENTS} is the most that is still one program with phone wiring, so this is a second program — keep the shared part shared`,
      );
    }
  }

  return {
    desktop,
    phone,
    desktopSegments: left.segments,
    phoneSegments: right.segments,
    sameOutside: left.outside === right.outside,
    outside: left.outside,
  };
}
