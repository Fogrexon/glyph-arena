import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(packageRoot, "src", "index.ts"), "utf8");

/** Comments are prose, not behaviour: the package's own docs may name a game's numbers. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** Every numeric literal in the code, so a game's number cannot hide in this package. */
function numericLiterals(text: string): string[] {
  return [...text.matchAll(/(?<![\w.$])(\d+(?:\.\d+)?)(?![\w.])/g)].map((match) => match[1]);
}

test("the source carries no numbers of its own — a reset is a list, not a clock", () => {
  const literals = numericLiterals(withoutComments(source));

  assert.deepEqual(literals, []);
});
