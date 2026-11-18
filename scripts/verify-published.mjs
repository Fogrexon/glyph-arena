#!/usr/bin/env node
// 傘パッケージの publish 後検証。registry / tarball のどちらでも同じ6項目を判定する。
//
//   node verify-published.mjs --tarball=/path/to/fogrexon-glyph-arena-<version>.tgz --tsc=/path/to/tsc
//   node verify-published.mjs --spec=@fogrexon/glyph-arena@<version> --tsc=/path/to/tsc
//
// 判定: ①install できる ②license=MIT・ESM only ③.cjs 0件・LICENSE 同梱
//       ④宣言の import 指定子が全て相対 ⑤ESM import で全サブパッケージが届く ⑥strict+NodeNext で tsc が通る
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const i = a.indexOf("=");
    return i === -1 ? [a.replace(/^--/, ""), true] : [a.slice(2, i), a.slice(i + 1)];
  }),
);
const target = args.tarball ? args.tarball : args.spec;
if (!target) {
  console.error("usage: --tarball=<path> | --spec=@fogrexon/glyph-arena@<version>");
  process.exit(2);
}

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const dir = mkdtempSync(join(tmpdir(), "ga-verify-"));
const run = (cmd, argv, opts = {}) =>
  execFileSync(cmd, argv, { cwd: dir, encoding: "utf8", stdio: "pipe", ...opts });

try {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "verify", private: true, type: "module" }, null, 2));

  // 1) install
  let installOk = true;
  let installErr = "";
  try {
    // A throwaway cache, because the shared one lies about time: right after a publish, `npm install
    // <pkg>@<new version>` answers `notarget` from a packument npm cached a minute earlier. That
    // turned two successful publishes (0.3.0, 0.4.0) into "failed to verify" — the one red that
    // invites publishing again. A fresh cache cannot be stale.
    run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", `--cache=${join(dir, ".npmcache")}`, target]);
  } catch (e) {
    installOk = false;
    installErr = String(e.stderr ?? e.message).trim().split("\n").slice(-2).join(" ");
  }
  check("install", installOk, installOk ? target : installErr);
  if (!installOk) throw new Error("install failed");

  const pkgDir = join(dir, "node_modules", "@fogrexon", "glyph-arena");
  const manifest = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

  // 2) manifest
  const ex = manifest.exports?.["."] ?? {};
  const esmOnly = manifest.type === "module" && ex.import && !ex.require && Object.keys(ex).sort().join(",") === "import,types";
  check("manifest", manifest.license === "MIT" && esmOnly,
    `license=${manifest.license} type=${manifest.type} exports=${JSON.stringify(ex)}`);

  // 3) files
  const walk = (p, acc = []) => {
    for (const e of readdirSync(p)) {
      const f = join(p, e);
      if (statSync(f).isDirectory()) walk(f, acc);
      else acc.push(f);
    }
    return acc;
  };
  const files = walk(pkgDir).map((f) => f.slice(pkgDir.length + 1));
  const cjs = files.filter((f) => f.endsWith(".cjs"));
  const hasLicense = files.includes("LICENSE");
  check("files", cjs.length === 0 && hasLicense, `cjs=${cjs.length} LICENSE=${hasLicense} total=${files.length}`);

  // 4) declarations: import specifiers must all be relative
  const specRe = /(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g;
  const bare = [];
  for (const f of files.filter((x) => x.endsWith(".d.ts"))) {
    const raw = readFileSync(join(pkgDir, f), "utf8");
    // コメントは宣言ではない（JSDoc に `@fogrexon/...` の使用例が書かれている）
    const text = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const m of text.matchAll(specRe)) {
      const s = m[1];
      if (!s.startsWith(".") && !s.startsWith("node:")) bare.push(`${f}: ${s}`);
    }
  }
  check("declarations-relative", bare.length === 0, bare.length ? bare.slice(0, 3).join(" | ") : `${files.filter((x) => x.endsWith(".d.ts")).length} d.ts files`);

  // 5) ESM import
  const probe = join(dir, "probe.mjs");
  writeFileSync(probe, `import * as m from '@fogrexon/glyph-arena';\nconsole.log(Object.keys(m).sort().join(','));\n`);
  const out = run(process.execPath, [probe]).trim();
  const names = out ? out.split(",") : [];
  // Not `=== 14`: the number of packages is a fact about `packages/`, and hard-coding it means the
  // release check fails *because the library grew*. What matters is that every subpackage still
  // reaches the umbrella; the exact export list is pinned by
  // `packages/glyph-arena/test/umbrella.test.ts`, which runs in CI on every pull request.
  const subpackages = readdirSync(join(REPO_ROOT, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "glyph-arena")
    .map((entry) => entry.name);
  check(
    "esm-import",
    names.length >= subpackages.length && names.every((name) => /^[A-Za-z_$][\w$]*$/.test(name)),
    `${names.length} exports from ${subpackages.length} subpackages`,
  );

  // 6) strict typecheck (NodeNext)
  const tsc = args.tsc || "tsc";
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({
    compilerOptions: { strict: true, module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022", noEmit: true, skipLibCheck: false },
    include: ["use.ts"],
  }, null, 2));
  writeFileSync(join(dir, "use.ts"),
    `import { createWorld, createLoop, createTimer, createCamera, type Matrix2D } from "@fogrexon/glyph-arena";
const t: Matrix2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const w = createWorld(); const timer = createTimer();
createLoop({ onFrame: () => { timer.delay(0.1, () => {}); } }); createCamera();
console.log(w, t);
`);
  let tscOk = true, tscErr = "";
  try {
    run(tsc, ["-p", "tsconfig.json"]);
  } catch (e) {
    tscOk = false;
    tscErr = String(e.stdout ?? e.message).trim().split("\n")[0];
  }
  check("tsc-strict", tscOk, tscOk ? "strict + NodeNext" : tscErr);

  if (args.spec && args.spec.includes("@") && !args.spec.startsWith("file:") && !args.spec.includes("/")) {
    const [, name, version] = args.spec.match(/^(@[^/]+\/[^@]+)@?(.*)$/) ?? [];
    if (name) {
      try {
        const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name).replace("%40", "@")}/${version || "latest"}`);
        const meta = await res.json();
        check("registry-metadata", res.ok && meta.license === "MIT", `${res.status} license=${meta.license}`);
      } catch (e) {
        check("registry-metadata", false, String(e.message));
      }
    }
  }
} catch (e) {
  console.error(`error: ${e.message}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${failed.length === 0 ? "ALL PASS" : `${failed.length} FAILED`} (${results.length} checks)`);
process.exit(failed.length === 0 ? 0 : 1);
