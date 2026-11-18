/**
 * Pull the tutorial's "The whole file" program out of `docs/tutorial.md`.
 *
 * That block is the only path a reader outside this repo walks: they copy it, import
 * `@fogrexon/glyph-arena`, and expect it to run. Twice now it has not — a spawn inside the floor,
 * and `jump` fed the held state instead of the press — and both were found by a person, not by CI,
 * because the block lived only inside a Markdown fence. `pnpm -r typecheck` never saw it.
 *
 * So the block is the source and the file that is compiled is derived from it: the fixture's
 * `typecheck` and `build` scripts call this first, and nothing else writes `main.ts`. If the docs
 * drift (the heading is renamed, the fence loses its `ts`, a subpackage import sneaks in), the
 * fixture fails to resolve and CI goes red with the line in `docs/tutorial.md` that is wrong.
 *
 * Extraction rules, all chosen to fail loudly rather than pick something plausible:
 *
 * - The heading is exact (`## The whole file`); the section ends at the next `##`/`#`.
 * - Exactly one `ts` (or `typescript`) fence may live in that section. Two is ambiguous — the
 *   reader would not know which one to copy either.
 * - The block must not be empty, and its `@fogrexon/` imports must be the umbrella package only:
 *   the subpackages are internal to this workspace, so a reader who copies one gets a module that
 *   npm does not have.
 */

/** The heading whose section holds the block. One string, because the error message names it. */
export const WHOLE_FILE_HEADING = "## The whole file";

/** Only the umbrella package is published, so it is the only one the tutorial may import. */
export const UMBRELLA_PACKAGE = "@fogrexon/glyph-arena";

const TS_LANGUAGES = new Set(["ts", "typescript"]);

/**
 * Every fenced block in one section of a document, with the line each body starts on (1-based).
 * A fence that never closes is an error: swallowing it would make the following prose look like
 * code, and the block we return would be silently truncated.
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
      throw new Error(
        `${source}:${index + 1}: the \`\`\`${info} fence under "${WHOLE_FILE_HEADING}" is never closed`,
      );
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
 * The program the tutorial tells people to copy, plus where it starts, so a compiler error can be
 * reported against `docs/tutorial.md` instead of a generated file nobody edits.
 */
export function wholeFileProgram(markdown, source = "docs/tutorial.md") {
  const lines = markdown.split(/\r?\n/);
  const heading = lines.findIndex((line) => line.trimEnd() === WHOLE_FILE_HEADING);

  if (heading === -1) {
    throw new Error(
      `${source}: no "${WHOLE_FILE_HEADING}" heading — the tutorial check has nothing to compile`,
    );
  }

  let end = lines.length;
  for (let scan = heading + 1; scan < lines.length; scan += 1) {
    if (/^#{1,2}\s/.test(lines[scan])) {
      end = scan;
      break;
    }
  }

  const candidates = fencedBlocks(lines, heading + 1, end, source).filter((block) =>
    TS_LANGUAGES.has(block.info),
  );

  if (candidates.length === 0) {
    throw new Error(
      `${source}: the "${WHOLE_FILE_HEADING}" section has no \`\`\`ts block — the reader has nothing to copy`,
    );
  }
  if (candidates.length > 1) {
    throw new Error(
      `${source}:${candidates[1].line}: the "${WHOLE_FILE_HEADING}" section has ${candidates.length} \`\`\`ts blocks; keep exactly one or the reader does not know which to copy`,
    );
  }

  const [block] = candidates;
  if (block.code.trim() === "") {
    throw new Error(`${source}:${block.line}: the "${WHOLE_FILE_HEADING}" \`\`\`ts block is empty`);
  }

  const imports = fogrexonImports(block.code);
  const foreign = imports.filter((name) => name !== UMBRELLA_PACKAGE);
  if (foreign.length > 0) {
    throw new Error(
      `${source}:${block.line}: the tutorial imports ${foreign.join(", ")}; only "${UMBRELLA_PACKAGE}" is published, so a reader outside this repo cannot resolve the rest`,
    );
  }
  if (!imports.includes(UMBRELLA_PACKAGE)) {
    throw new Error(
      `${source}:${block.line}: the tutorial never imports "${UMBRELLA_PACKAGE}" — the whole point of the block is the one import`,
    );
  }

  return { code: block.code, line: block.line };
}
