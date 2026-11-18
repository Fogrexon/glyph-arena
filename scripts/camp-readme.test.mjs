/**
 * The camp page is a description of numbers, so the numbers are the thing that can rot.
 *
 * Every row of the constant table in `examples/camp/README.md` names a constant (`ENEMY_AI.restMs`)
 * and its value, and every one of those is a value this game's code decides. A tuning pass that
 * changes `restMs` and forgets the page is exactly the failure this checks: the page would keep
 * telling the next reader "450, because reversing a retreat costs 125 ms" while the fight runs 380.
 *
 * Both sides come from the repository: the page is parsed, the constants are parsed out of the
 * source. Nothing is compared with a number written down here — a list kept in the test would be the
 * fourth "adding a value makes it red" waiting to happen.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(`${ROOT}${path}`, "utf8");

/** Where a constant may live. A key must be found in exactly one of these, or this test is lying. */
const SOURCES = ["examples/camp/src/combat.ts", "examples/camp/src/enemy.ts", "examples/camp/src/main.ts"];

/** `| \`ENEMY_AI.restMs\` | 450 | …` → `["ENEMY_AI.restMs", "450"]` */
function tableRows(page) {
  const rows = [...page.matchAll(/^\|\s*`([A-Za-z_][\w]*)\.(\w+)`\s*\|\s*(\d+)\s*\|/gm)];
  return rows.map((match) => ({ group: match[1], key: match[2], value: match[3] }));
}

test("every constant the camp page names still has that value in the code", () => {
  const page = read("examples/camp/README.md");
  const rows = tableRows(page);
  assert.ok(rows.length >= 10, `the page's table should name the numbers the fight is made of, found ${rows.length}`);

  // Look the value up **inside the object it names**: two constants can share a key and a value
  // (`ENEMY_STATS.sightPx` and `ENEMY_AI.sightPx` were both 260), and a page that named one of them
  // would pass either way. The block is found by its name, so the row is checked against the thing
  // it claims.
  const sources = SOURCES.map((path) => ({ path, text: read(path) }));
  const missing = [];
  for (const { group, key, value } of rows) {
    const blocks = sources
      .map((source) => {
        const match = new RegExp(`(?:export )?const ${group}\\s*=\\s*\\{([\\s\\S]*?)\\}(?:\\s+as const)?;`).exec(source.text);
        return match === null ? null : { path: source.path, body: match[1] };
      })
      .filter((block) => block !== null);
    if (blocks.length === 0) {
      missing.push(`${group}.${key}: no source declares \`${group}\``);
      continue;
    }
    const pattern = new RegExp(`\\b${key}\\s*:\\s*${value}\\b`);
    const hits = blocks.filter((block) => pattern.test(block.body));
    if (hits.length !== 1) {
      missing.push(
        hits.length === 0
          ? `${group}.${key} = ${value} (the code says something else)`
          : `${group}.${key} = ${value} is declared twice: ${hits.map((hit) => hit.path).join(", ")}`,
      );
    }
  }
  assert.deepEqual(missing, [], "the page and the fight disagree; fix the page (or the number) and re-run");
});

test("the page's room dimensions are the level's", () => {
  const page = read("examples/camp/README.md");
  const level = read("examples/camp/src/level.ts");

  const tile = Number(/export const TILE = (\d+);/.exec(level)?.[1]);
  const block = /const TEXT: readonly string\[\] = \[([\s\S]*?)\n\];/.exec(level)?.[1] ?? "";
  const rows = [...block.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
  const columns = Math.max(...rows.map((row) => row.length));

  assert.ok(rows.length > 0, "the level's rows are still written as strings");
  assert.match(
    page,
    new RegExp(`${columns} × ${rows.length} tiles of ${tile} px`),
    `the level is ${columns} × ${rows.length} tiles of ${tile} px; the page says something else`,
  );
});
