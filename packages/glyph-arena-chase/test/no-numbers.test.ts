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

/** Every numeric literal in the code, so a sight radius cannot hide in a default. */
function numericLiterals(text: string): string[] {
  return [...text.matchAll(/(?<![\w.$])(\d+(?:\.\d+)?)(?![\w.])/g)].map((match) => match[1]);
}

const ALLOWED = new Set([
  // The two ends of a direction, and the "no gap at all" comparison. They are arithmetic, not feel.
  "0",
  "1",
  "2",
]);

test("the source carries no numbers of its own, only the arithmetic ones", () => {
  const literals = numericLiterals(withoutComments(source));
  const offenders = literals.filter((literal) => !ALLOWED.has(literal));

  assert.deepEqual(
    [...new Set(offenders)].sort(),
    [],
    `a number that belongs to a game is in the package: ${[...new Set(offenders)].join(", ")} — ` +
      "move it into the caller's ChaseConfig",
  );
});

test("every field of ChaseConfig is required, so no default can grow back", () => {
  const config = source.slice(
    source.indexOf("export type ChaseConfig"),
    source.indexOf("};", source.indexOf("export type ChaseConfig")),
  );
  const optional = config
    .split("\n")
    .filter((line) => /^\s+\w+\?\s*:/.test(line))
    .map((line) => line.trim());

  assert.deepEqual(optional, [], `optional config fields are defaults in disguise: ${optional.join(" | ")}`);
});

test("no speed, and no dt, so the caller keeps the moving", () => {
  assert.doesNotMatch(withoutComments(source), /\bspeedPx|\bdt\b|velocity/);
});
