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
 * The program the tutorial tells people to copy, plus where it starts, so a compiler error can be
 * reported against `docs/tutorial.md` instead of a generated file nobody edits.
 */
export function wholeFileProgram(markdown, source = "docs/tutorial.md") {
  return singleProgram(markdown, { heading: WHOLE_FILE_HEADING, source });
}
