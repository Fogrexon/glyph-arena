import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(packageRoot, "src", "index.ts"), "utf8");

/** Comments are prose, not behaviour: the package's own docs may name a game's tile size. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** Every numeric literal in the code, so a `32` cannot hide in a default. */
function numericLiterals(text: string): string[] {
  return [...text.matchAll(/(?<![\w.$])(\d+(?:\.\d+)?)(?![\w.])/g)].map((match) => match[1]);
}

const ALLOWED = new Set([
  // 0 and 1 are arithmetic, not a game's numbers: "outside the map starts at -1", "step by one
  // row", "the last column is the one before the edge".
  "0",
  "1",
]);

test("the source carries no numbers of its own, only the arithmetic ones", () => {
  const literals = numericLiterals(withoutComments(source));
  const offenders = literals.filter((literal) => !ALLOWED.has(literal));

  assert.deepEqual(
    [...new Set(offenders)].sort(),
    [],
    `a number that belongs to a game is in the package: ${[...new Set(offenders)].join(", ")} — ` +
      "the cell size comes from the game's config",
  );
});

test("maxRows is required, so no default search depth can grow back", () => {
  // A default here would decide, silently, how deep the world is — and find the floor under a pit.
  assert.doesNotMatch(withoutComments(source), /maxRows\s*\?/);
  assert.match(withoutComments(source), /maxRows:\s*number/);
});
