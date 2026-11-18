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

import { sectionBlocks, singleProgram } from "./markdown-program.mjs";

export { UMBRELLA_PACKAGE, fogrexonImports } from "./markdown-program.mjs";

/** The heading whose section holds the block. One string, because the error message names it. */
export const WHOLE_FILE_HEADING = "## The whole file";

/** The section whose self-contained block the phone gate probes (see extract-tutorial-phone). */
export const PHONE_HEADING = "## On a phone";

/**
 * The program the tutorial tells people to copy, plus where it starts, so a compiler error can be
 * reported against `docs/tutorial.md` instead of a generated file nobody edits.
 */
export function wholeFileProgram(markdown, source = "docs/tutorial.md") {
  return singleProgram(markdown, { heading: WHOLE_FILE_HEADING, source });
}

/**
 * The one self-contained block in the phone section: the one that builds the pad.
 *
 * The other three snippets are inserts into the program above (a resize hook, a pointer conversion
 * inside the frame, and the frame's own readings), so they cannot be run on their own. This one —
 * `buildPad(width, height)` — can, and it is where the size arithmetic lives: three 120 px squares
 * need 432 px, so the constant overlapped on phones (30 px at 390, 60 px at 360).
 */
export function tutorialPadBlock(markdown, source = "docs/tutorial.md") {
  const blocks = sectionBlocks(markdown, { heading: PHONE_HEADING, source });
  const zoneBlocks = blocks.filter((block) => block.code.includes("createTouchControls"));

  if (zoneBlocks.length !== 1) {
    throw new Error(
      `${source}: the "${PHONE_HEADING}" section has ${zoneBlocks.length} \`\`\`ts blocks that call createTouchControls; the gate needs exactly one`,
    );
  }

  const [block] = zoneBlocks;
  if (!/function buildPad\(/.test(block.code)) {
    throw new Error(
      `${source}:${block.line}: the zone block does not define buildPad, so the gate has nothing to probe`,
    );
  }

  return block;
}
