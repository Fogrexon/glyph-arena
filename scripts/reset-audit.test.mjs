/**
 * The scanner's own gate.
 *
 * The four `*-reset.test.mjs` files trust this module to be able to say "no". A scanner that
 * returns nothing missing for every input makes all four green forever, and nothing in their logs
 * would look wrong — so the failure modes are pinned here with fixtures, not with the real slices.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { auditSource, missingFields, resetRegion, scopedLets } from "./reset-audit.mjs";

const ROOT = new URL("..", import.meta.url).pathname;

test("a slice's fields are the `let`s at its own scope, and nothing deeper", () => {
  const source = [
    "let moduleWide = 0;",
    "async function main() {",
    "  let runWide = 0;",
    "  let alsoRunWide = 0;",
    "  function tick() {",
    "    let perFrame = 0;",
    "    perFrame += 1;",
    "  }",
    "  const notScanned = [];",
    "}",
  ].join("\n");
  assert.deepEqual(scopedLets(source), ["moduleWide", "runWide", "alsoRunWide"]);
});

test("the region stops at the first thing that is not a registration", () => {
  const atFunction = ["const reset = createReset();", 'reset.add("a", () => {', "  a = 0;", "});", "", "function go() {", "}"].join("\n");
  assert.doesNotMatch(resetRegion(atFunction, "fixture"), /function go/);

  const atCall = ["const reset = createReset();", 'reset.add("a", () => {', "  a = 0;", "});", "reset.run();", "function go() {}"].join("\n");
  const region = resetRegion(atCall, "fixture");
  assert.match(region, /a = 0/);
  assert.doesNotMatch(region, /reset\.run\(\)/);

  const atConst = ["const reset = createReset();", 'reset.add("a", () => {', "  a = 0;", "});", "const after = 1;"].join("\n");
  assert.doesNotMatch(resetRegion(atConst, "fixture"), /const after/);
});

test("a slice that stopped using the package is red, not silently clean", () => {
  assert.throws(() => resetRegion("function resetRun() { a = 0; }", "some slice"), /some slice no longer registers/);
});

test("a field that is only compared is not a field that is put back", () => {
  // The subtle one: `x === 1` in the registrations mentions `x`, and a scanner that took any `=`
  // would call that "x is reset". `y.length = 0` is a real reset of a collection.
  assert.deepEqual(missingFields(["x", "y", "z"], "if (x === 1) { y.length = 0; }"), ["x", "z"]);
});

const SLICE = [
  "let runWide = 0;",
  "let kept = 0;",
  "const reset = createReset();",
  'reset.add("run", () => {',
  "  runWide = 0;",
  "});",
  // A slice always has code after its registrations; the region ends there.
  "function start() {",
  "  runWide = 1;",
  "}",
].join("\n");

test("a field that is kept is not asked for, and a kept field that is assigned is red", () => {
  const audit = auditSource(SLICE, { kept: "the harness reads it between runs" });
  audit.coversAll();
  audit.keepsKept();

  const wrong = auditSource(SLICE, { runWide: "claims this is kept" });
  assert.throws(() => wrong.keepsKept(), /KEPT says `runWide` is kept, but the reset assigns it/);

  const ghost = auditSource(SLICE, { notDeclared: "a name that is not state" });
  assert.throws(() => ghost.keepsKept(), /KEPT names `notDeclared`/);

  const missing = auditSource(SLICE, {});
  // `kept` is not in KEPT and is never assigned: this is the bug the four gates exist for.
  assert.deepEqual(missing.missed, ["kept"]);
  assert.throws(() => missing.coversAll(), /the reset does not put back: kept/);
});

test("all four real slices still have registrations the scanner can find", () => {
  for (const path of [
    "examples/march/src/main.ts",
    "examples/parry/src/main.ts",
    "examples/pickup-demo/src/main.ts",
    "examples/runner/src/main.ts",
  ]) {
    const source = readFileSync(`${ROOT}${path}`, "utf8");
    const region = resetRegion(source, path);
    assert.ok(region.includes("reset.add("), `${path}: no registrations found in the region`);
    assert.ok(scopedLets(source).length > 0, `${path}: no state found`);
  }
});
