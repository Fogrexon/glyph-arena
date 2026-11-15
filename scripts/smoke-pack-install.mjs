#!/usr/bin/env node
/**
 * npm 公開 smoke test: `pnpm pack` → 一時ディレクトリへ install → import / tsc。
 *
 * It never touches a registry: `npm install --offline` against local tarballs,
 * and all 14 packages have empty `dependencies`, so the install resolves
 * without network access.
 *
 * Checks (see the "npm 公開 smoke test 受け入れ" spec):
 *   S1 every tarball ships `dist/index.js` and `dist/index.d.ts`
 *   S2 all 14 tarballs install into an empty project, offline, and `import`
 *     resolves from node_modules alone
 *   S3 a `strict` NodeNext consumer typechecks, and `--traceResolution` shows
 *     the declaration that was used is the packaged `dist/index.d.ts`
 *   S4 two negative controls, both required:
 *      (a) emptying a packaged `dist/index.d.ts` must turn S3 red — otherwise
 *          the check is not looking at types at all
 *      (b) pointing `types`/`exports.types` at a missing file stays green,
 *          because TypeScript falls back to the declaration beside
 *          `dist/index.js`. That fallback is exactly why
 *          `check:package-entry-points` exists; asserting it here makes a
 *          behaviour change visible instead of silently widening a hole.
 */

import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..");
const PACKAGES_DIR = join(REPO, "packages");
const TSC = join(REPO, "node_modules", ".bin", "tsc");

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: REPO,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function tryRun(command, args, options = {}) {
  try {
    return { ok: true, output: run(command, args, options) };
  } catch (error) {
    return {
      ok: false,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`ok   ${message}`);
}

function packageDirs() {
  return readdirSync(PACKAGES_DIR)
    .map((name) => ({ name, dir: join(PACKAGES_DIR, name) }))
    .filter((entry) => {
      try {
        readFileSync(join(entry.dir, "package.json"), "utf8");
        return true;
      } catch {
        return false;
      }
    });
}

function manifestOf(dir) {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
}

const work = mkdtempSync(join(tmpdir(), "glyph-smoke-"));
const packDir = join(work, "tarballs");
const projectDir = join(work, "consumer");

try {
  const packages = packageDirs().map((entry) => ({
    ...entry,
    manifest: manifestOf(entry.dir),
  }));

  // ---- S1: pack and inspect the published file set -------------------------
  const tarballs = new Map();
  for (const pkg of packages) {
    const packed = run("pnpm", ["pack", "--pack-destination", packDir], {
      cwd: pkg.dir,
    });
    const tarball = packed
      .split("\n")
      .map((line) => line.trim())
      .reverse()
      .find((line) => line.endsWith(".tgz"));
    if (!tarball) {
      fail(`S1 ${pkg.manifest.name}: pnpm pack did not report a tarball`);
      continue;
    }

    tarballs.set(pkg.manifest.name, tarball);
    const listing = run("tar", ["-tzf", tarball]);
    for (const required of ["package/dist/index.js", "package/dist/index.d.ts"]) {
      if (!listing.split("\n").includes(required)) {
        fail(`S1 ${pkg.manifest.name}: tarball is missing ${required}`);
      }
    }
  }
  if (!process.exitCode) {
    ok(`S1 ${tarballs.size} tarballs ship dist/index.js + dist/index.d.ts`);
  }

  // ---- S2: offline install into an empty project ---------------------------
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(
    join(projectDir, "package.json"),
    `${JSON.stringify(
      {
        name: "glyph-smoke-consumer",
        private: true,
        type: "module",
        dependencies: Object.fromEntries(
          [...tarballs].map(([name, tarball]) => [name, `file:${tarball}`]),
        ),
      },
      null,
      2,
    )}\n`,
  );

  const install = tryRun(
    "npm",
    ["install", "--offline", "--no-audit", "--no-fund", "--ignore-scripts"],
    { cwd: projectDir },
  );
  if (!install.ok) {
    fail(`S2 offline install failed:\n${install.output}`);
  } else {
    ok("S2 all tarballs installed offline");
  }

  cpSync(join(REPO, "scripts/smoke/consumer.mts"), join(projectDir, "consumer.mts"));
  writeFileSync(
    join(projectDir, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          lib: ["ES2022", "DOM", "DOM.Iterable"],
        },
        include: ["consumer.mts"],
      },
      null,
      2,
    )}\n`,
  );

  const imports = tryRun(
    "node",
    [
      "--input-type=module",
      "-e",
      `const names = ${JSON.stringify([...tarballs.keys()])};
for (const name of names) {
  await import(name);
}
console.log("imported " + names.length);`,
    ],
    { cwd: projectDir },
  );
  if (!imports.ok) {
    fail(`S2 import from node_modules failed:\n${imports.output}`);
  } else {
    ok("S2 every package imports from node_modules without the workspace");
  }

  // ---- S3: strict typecheck against the packaged declarations --------------
  const typecheck = tryRun(TSC, ["-p", "tsconfig.json"], { cwd: projectDir });
  if (!typecheck.ok) {
    fail(`S3 strict typecheck failed:\n${typecheck.output}`);
  } else {
    ok("S3 strict typecheck passes against the installed tarballs");
  }

  const trace = tryRun(TSC, ["-p", "tsconfig.json", "--traceResolution"], {
    cwd: projectDir,
  });
  for (const name of tarballs.keys()) {
    const expected = join(projectDir, "node_modules", name, "dist/index.d.ts");
    if (!trace.output.includes(`Resolving real path for '${expected}'`)) {
      fail(`S3 ${name}: traceResolution did not select ${expected}`);
    }
  }
  if (!process.exitCode) {
    ok(`S3 traceResolution selects dist/index.d.ts for all ${tarballs.size}`);
  }

  // ---- S4a: breaking the packaged declaration must turn S3 red -------------
  const probe = "@fogrexon/glyph-arena-ecs";
  const probeDts = join(projectDir, "node_modules", probe, "dist/index.d.ts");
  const probeDtsBackup = readFileSync(probeDts, "utf8");
  writeFileSync(probeDts, "export {};\n");
  const redOnEmptyDts = tryRun(TSC, ["-p", "tsconfig.json"], {
    cwd: projectDir,
  });
  writeFileSync(probeDts, probeDtsBackup);
  if (redOnEmptyDts.ok) {
    fail(
      `S4a emptying ${probe}/dist/index.d.ts did NOT fail the typecheck — the smoke test is not reading types`,
    );
  } else {
    ok(`S4a emptying ${probe}/dist/index.d.ts is red as required`);
  }

  // ---- S4b: a missing types path stays green (TS falls back) ---------------
  const probeManifestPath = join(projectDir, "node_modules", probe, "package.json");
  const probeManifestBackup = readFileSync(probeManifestPath, "utf8");
  const brokenManifest = JSON.parse(probeManifestBackup);
  brokenManifest.types = "./dist/NOPE.d.ts";
  brokenManifest.exports["."].types = "./dist/NOPE.d.ts";
  writeFileSync(probeManifestPath, `${JSON.stringify(brokenManifest, null, 2)}\n`);
  const greenOnMissingTypes = tryRun(TSC, ["-p", "tsconfig.json"], {
    cwd: projectDir,
  });
  writeFileSync(probeManifestPath, probeManifestBackup);
  if (!greenOnMissingTypes.ok) {
    fail(
      `S4b a missing types path is now red — good news, but the comment in this script and the reason check:package-entry-points exists are stale. Update both.\n${greenOnMissingTypes.output}`,
    );
  } else {
    ok("S4b missing types path still falls back to the sibling d.ts (covered by check:package-entry-points)");
  }
} finally {
  if (process.env.SMOKE_KEEP) {
    console.log(`kept ${work}`);
  } else {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.exitCode) {
  console.error("smoke test failed");
} else {
  console.log("smoke test passed");
}
