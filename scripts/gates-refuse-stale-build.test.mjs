/**
 * A gate that reads a build must prove the build is current.
 *
 * Six gates read an artifact nobody rebuilt on 2026-11-18 (#248, #250, #252): a browser gate served
 * yesterday's `dist`, `smoke:pack-install` packed one, two `tsc` gates compiled against one. Each was
 * closed by hand, and each closure looks the same — the gate refuses to run unless the build's stamp
 * matches the sources it was built from.
 *
 * The next gate will be written by someone who was not here for that. So this walks the gates
 * themselves, derived from `scripts/`, and fails on any gate that reads a build without asking
 * whether it is current. There is no list to keep: adding `scripts/e2e-<name>.mjs` puts it under this
 * test by itself, and forgetting the check is a red that names the file.
 *
 * Two ways to satisfy it:
 *   - import `requireFresh` / `requireFreshPackages` from `./lib/build-stamp.mjs` and call it, or
 *   - rebuild what you read inside the gate (`e2e:published` deletes `dist/` and lets `prepack`
 *     rebuild and stamp it, then checks that stamp) — the check still has to be there.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const SCRIPTS = join(ROOT, "scripts");

/** A gate: the entry points a person runs. `*.test.mjs` are not gates. */
const GATE_NAME = /^(e2e|smoke)-.+\.mjs$/;

/** Every gate, derived from the directory rather than listed. */
export function gateNames(dir = SCRIPTS) {
  return readdirSync(dir)
    .filter((name) => GATE_NAME.test(name))
    .sort();
}

/**
 * Drop comments, keeping string and template literals intact.
 *
 * Without this, the prose in a gate's header ("serves `examples/pickup-demo/dist`") would count as
 * reading a build, and a gate could be forced to add a check it does not need because of a comment.
 */
export function stripComments(source) {
  let out = "";
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
      index += 2;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      out += char;
      index += 1;
      while (index < source.length) {
        if (source[index] === "\\") {
          out += source[index] + (source[index + 1] ?? "");
          index += 2;
          continue;
        }
        out += source[index];
        const done = source[index] === quote;
        index += 1;
        if (done) break;
      }
      continue;
    }

    out += char;
    index += 1;
  }

  return out;
}

/**
 * Does this gate read a build directory?
 *
 * `"dist"`, `"dist/index.js"`, `"package/dist/index.js"`, `examples/parry/dist` — all a path segment.
 * `distFor(...)` builds one from the kind. Nothing else: a gate that only *mentions* a build in prose
 * is not reading one, and `stripComments` has already removed the prose.
 */
export function readsBuild(code) {
  return /\bdist\b/.test(code) || /\bdistFor\s*\(/.test(code);
}

/** It asks the stamp module for a freshness check... */
const IMPORTS_STAMP = /from\s*["'][^"']*lib\/build-stamp\.mjs["']/;

/** ...and it calls one. An unused import is not a check. */
const CALLS_STAMP = /\brequireFresh\w*\s*\(/;

export function checksFreshness(code) {
  return IMPORTS_STAMP.test(code) && CALLS_STAMP.test(code);
}

test("the predicate is not vacuous", () => {
  // A gate that serves a build and never checks it: must be seen as reading, and as unchecked.
  const unchecked = 'const dir = join(ROOT, "examples", "fake", "dist");\nserveDist({ root: dir });\n';
  assert.equal(readsBuild(stripComments(unchecked)), true, "a `dist` path segment must count as reading a build");
  assert.equal(checksFreshness(stripComments(unchecked)), false, "no import and no call must count as unchecked");

  // Prose about a build is not reading one.
  const prose = "// we serve examples/fake/dist from 127.0.0.1\nconst port = 1234;\n";
  assert.equal(readsBuild(stripComments(prose)), false, "a comment must not make a gate look like it reads a build");

  // The two shapes that pass.
  const imported = 'import { requireFresh } from "./lib/build-stamp.mjs";\nrequireFresh("fake", ROOT);\n';
  assert.equal(checksFreshness(stripComments(imported)), true);
});

test("every gate that reads a build refuses one older than its sources", () => {
  const gates = gateNames();
  assert.ok(gates.length >= 5, `expected to find the gates in ${SCRIPTS}, found ${gates.length}`);

  const readers = [];
  const offenders = [];

  for (const name of gates) {
    const code = stripComments(readFileSync(join(SCRIPTS, name), "utf8"));
    if (!readsBuild(code)) continue;
    readers.push(name);
    if (!checksFreshness(code)) offenders.push(name);
  }

  // If the predicate stops matching, this test must go red rather than quietly checking nothing.
  assert.ok(readers.length >= 5, `only ${readers.length} gate(s) matched "reads a build" — the predicate broke, not the gates`);

  assert.deepEqual(
    offenders,
    [],
    `these gates read a build but never ask whether it is current: ${offenders.join(", ")} — ` +
      'import { requireFresh } from "./lib/build-stamp.mjs" and call it before reading, or rebuild the build inside the gate and check its stamp',
  );
});
