#!/usr/bin/env node
/**
 * Run a gate N times and report how often it fails.
 *
 * "Re-run and it was green" is not a diagnosis: a gate that fails one run in twenty looks exactly
 * like a gate that never fails, until it fails on main. This runs the same command in a loop and
 * prints the rate, plus the FAIL lines of the runs that failed.
 *
 * Usage: `node scripts/e2e-repeat.mjs 20 node scripts/e2e-tutorial-phone.mjs`
 * (`pnpm e2e:flake` runs the tutorial's phone gate ten times.)
 */
import { spawnSync } from "node:child_process";

const [runs, ...command] = process.argv.slice(2);

if (runs === undefined || command.length === 0) {
  console.error("usage: node scripts/e2e-repeat.mjs <runs> <command...>");
  process.exit(2);
}

const total = Number(runs);
if (!Number.isInteger(total) || total < 1) {
  console.error(`runs must be a positive integer, got "${runs}"`);
  process.exit(2);
}

const failures = [];

for (let run = 1; run <= total; run += 1) {
  const started = Date.now();
  const result = spawnSync(command[0], command.slice(1), { encoding: "utf8", env: process.env });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const red = result.status !== 0;
  const failed = output.split("\n").filter((line) => /^(FAIL|not ok)/.test(line.trim()));

  if (red) failures.push({ run, failed, output });
  console.log(
    `run ${String(run).padStart(2)}/${total}  ${red ? "FAIL" : "ok  "}  ${seconds}s${failed.length > 0 ? `  ${failed.join(" | ")}` : ""}`,
  );
}

console.log(`\n${failures.length}/${total} runs failed`);

if (failures.length > 0) {
  for (const failure of failures) {
    console.log(`\n--- run ${failure.run} (tail) ---`);
    console.log(failure.output.split("\n").slice(-25).join("\n"));
  }

  process.exitCode = 1;
}
