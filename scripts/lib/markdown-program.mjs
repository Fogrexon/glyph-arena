/**
 * The one code block a document promises is a program, pulled out of Markdown.
 *
 * Two documents make that promise to people outside this repo: the tutorial's `## The whole file`
 * (what a reader copies to build a game) and the umbrella `README.md`'s only `ts` block (the first
 * fifteen lines anyone sees on npm, and it **freezes inside the tarball until the next version**).
 * Both are compiled and run by CI, so neither can describe a program that does not work.
 *
 * The rules are the same for both, and each one fails loudly instead of picking something plausible:
 *
 * - The block is found by heading when a heading is given, and the section ends at the next
 *   `##`/`#`; without a heading the whole document is the section.
 * - Exactly one `ts` (or `typescript`) fence may live there. Two is ambiguous — the reader would
 *   not know which one to copy either.
 * - A fence that never closes is an error: swallowing it would make the following prose look like
 *   code, and the block we return would be silently truncated.
 * - The block must not be empty, and its `@fogrexon/…` imports must be the umbrella package only:
 *   the subpackages are internal to this workspace, so a reader who copies one gets a module that
 *   npm does not have.
 */

/** Only the umbrella package is published, so it is the only one the documents may import. */
export const UMBRELLA_PACKAGE = "@fogrexon/glyph-arena";

const TS_LANGUAGES = new Set(["ts", "typescript"]);

/**
 * Every fenced block in one section of a document, with the line each body starts on (1-based).
 */
function fencedBlocks(lines, from, to, source) {
  const blocks = [];

  for (let index = from; index < to; index += 1) {
    const open = /^```(\S*)\s*$/.exec(lines[index]);
    if (open === null) continue;

    const info = open[1];
    let close = -1;
    for (let scan = index + 1; scan < to; scan += 1) {
      if (/^```\s*$/.test(lines[scan])) {
        close = scan;
        break;
      }
    }

    if (close === -1) {
      throw new Error(`${source}:${index + 1}: the \`\`\`${info} fence is never closed`);
    }

    blocks.push({
      info,
      line: index + 2,
      code: lines.slice(index + 1, close).join("\n"),
    });
    index = close;
  }

  return blocks;
}

/** The `@fogrexon/…` specifiers a block imports, so the caller can refuse a subpackage. */
export function fogrexonImports(code) {
  const found = new Set();

  for (const match of code.matchAll(/(?:from|import)\s*\(?\s*["'](@fogrexon\/[^"']+)["']/g)) {
    found.add(match[1]);
  }

  return [...found].sort();
}

/**
 * Every `ts` block in one section, in document order, with the line each starts on.
 *
 * The tutorial's phone section is four snippets that get spliced into the program above, not one
 * file: three of them are inserts into code that already exists. That makes them impossible to
 * concatenate, but one of them — the `createTouchControls` one — is self-contained, and it is the
 * one a size constant can break (three 120 px squares need 432 px, so below that the right zone and
 * the jump zone overlap). The tutorial fixture extracts that block and the browser gate probes its
 * zones at several widths.
 *
 * An empty list is not an error here; the caller decides what it needs and says so.
 */
export function sectionBlocks(markdown, { heading, source = "document.md" }) {
  const lines = markdown.split(/\r?\n/);
  const at = lines.findIndex((line) => line.trimEnd() === heading);

  if (at === -1) {
    throw new Error(`${source}: no "${heading}" heading — the check has nothing to compile`);
  }

  let end = lines.length;
  for (let scan = at + 1; scan < lines.length; scan += 1) {
    if (/^#{1,2}\s/.test(lines[scan])) {
      end = scan;
      break;
    }
  }

  return fencedBlocks(lines, at + 1, end, source).filter((block) => TS_LANGUAGES.has(block.info));
}

/**
 * The program one document tells people to copy, plus where it starts, so a compiler error can be
 * reported against the Markdown instead of a generated file nobody edits.
 *
 * `heading` is optional: the tutorial addresses its block by name, while the README has one program
 * and no heading worth pinning a check to.
 */
export function singleProgram(markdown, { heading, source = "document.md" }) {
  const lines = markdown.split(/\r?\n/);
  const where = heading === undefined ? source : `the "${heading}" section`;

  let from = 0;
  let to = lines.length;

  if (heading !== undefined) {
    const at = lines.findIndex((line) => line.trimEnd() === heading);
    if (at === -1) {
      throw new Error(`${source}: no "${heading}" heading — the check has nothing to compile`);
    }

    from = at + 1;
    to = lines.length;
    for (let scan = at + 1; scan < lines.length; scan += 1) {
      if (/^#{1,2}\s/.test(lines[scan])) {
        to = scan;
        break;
      }
    }
  }

  const candidates = fencedBlocks(lines, from, to, source).filter((block) =>
    TS_LANGUAGES.has(block.info),
  );

  if (candidates.length === 0) {
    throw new Error(`${source}: ${where} has no \`\`\`ts block — the reader has nothing to copy`);
  }
  if (candidates.length > 1) {
    throw new Error(
      `${source}:${candidates[1].line}: ${where} has ${candidates.length} \`\`\`ts blocks; keep exactly one or the reader does not know which to copy`,
    );
  }

  const [block] = candidates;
  if (block.code.trim() === "") {
    throw new Error(`${source}:${block.line}: the \`\`\`ts block is empty`);
  }

  const imports = fogrexonImports(block.code);
  const foreign = imports.filter((name) => name !== UMBRELLA_PACKAGE);
  if (foreign.length > 0) {
    throw new Error(
      `${source}:${block.line}: the block imports ${foreign.join(", ")}; only "${UMBRELLA_PACKAGE}" is published, so a reader outside this repo cannot resolve the rest`,
    );
  }
  if (!imports.includes(UMBRELLA_PACKAGE)) {
    throw new Error(
      `${source}:${block.line}: the block never imports "${UMBRELLA_PACKAGE}" — the whole point of the block is the one import`,
    );
  }

  return { code: block.code, line: block.line };
}
