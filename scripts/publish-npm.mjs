#!/usr/bin/env node
// One command for the irreversible step: publish @fogrexon/glyph-arena.
//
//   pnpm publish:npm            preflight only (builds, packs, verifies — publishes nothing)
//   pnpm publish:npm --publish  publishes the exact tarball that passed the preflight
//
// Everything that must be true about the artifact is checked by scripts/verify-published.mjs.
// Running that against the tarball and then publishing *that tarball* is what makes the thing
// we verified the thing npm received. The tag check exists because publishing an untagged commit
// is how a tag and a published artifact drift apart.
//
// Order of the two public facts: the tag is cut **locally** (so the commit is the commit), the
// tarball is published, the registry copy is verified, and only then is the tag pushed. A tag on
// `origin` whose version npm answers 404 for tells a clone to install something that is not there.
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PKG = "@fogrexon/glyph-arena";
const DIR = join(ROOT, "packages", "glyph-arena");
const shouldPublish = process.argv.includes("--publish");
const die = (m) => { console.error(`FAIL  ${m}`); process.exit(1); };
const ok = (m) => console.log(`PASS  ${m}`);
const info = (m) => console.log(`      ${m}`);
const sh = (cmd, argv, opts = {}) => execFileSync(cmd, argv, { cwd: ROOT, encoding: "utf8", stdio: "pipe", ...opts });

const version = JSON.parse(readFileSync(join(DIR, "package.json"), "utf8")).version;
const tag = `v${version}`;
console.log(`publish ${PKG}@${version} (tag ${tag})\n`);

// 1) HEAD must be the tagged commit. The tag is cut locally and pushed only after the registry
// copy is verified: a tag on `origin` whose version npm answers 404 for tells a clone to install
// something that does not exist.
let head = "";
try { head = sh("git", ["describe", "--tags", "--exact-match", "HEAD"]).trim(); } catch {
  die(`HEAD is not an exact tag — cut ${tag} first (git tag ${tag})`);
}
if (head !== tag) die(`HEAD is tagged ${head}, package version is ${version}`);
ok(`HEAD is ${head}`);
const onOrigin = sh("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`]).trim();
if (onOrigin) {
  const remoteSha = onOrigin.split(/\s+/)[0];
  if (remoteSha !== sh("git", ["rev-parse", "HEAD"]).trim()) die(`origin's ${tag} is ${remoteSha}, not HEAD`);
  info(`origin already has ${tag} (it will point at a published version once this run finishes)`);
} else {
  info(`origin has no ${tag} yet — it is pushed after the registry copy is verified`);
}

// 2) A dirty tree means the tarball would not be the tagged source.
const dirty = sh("git", ["status", "--porcelain"]).trim();
if (dirty) die(`working tree is dirty:\n${dirty}`);
ok("working tree is clean");

// 3) Refuse before building if npm already has this version.
let published = {};
try {
  const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(PKG)}`);
  if (res.ok) published = (await res.json()).versions ?? {};
} catch (e) { info(`registry lookup failed (${String(e.message).split("\n")[0]}) — continuing`); }
if (published[version]) die(`${PKG}@${version} is already on npm — bump the version`);
ok(`npm has no ${version} yet`);

// 3b) The umbrella README is frozen into the tarball: npm shows it until the next version, so a
// stale one cannot be fixed without a release. The check derives the module list from packages/.
try { sh(process.execPath, [join(ROOT, "scripts", "check-umbrella-readme.mjs")], { stdio: "inherit" }); }
catch { die("the umbrella README does not match the code — fix packages/glyph-arena/README.md first (it is frozen into the tarball)"); }
ok("umbrella README matches packages/");

// 4) Build and pack; the checks read the tarball, never the tree.
console.log("\nbuilding…");
try { sh("pnpm", ["--filter", PKG, "build"]); } catch (e) { die(`build failed:\n${e.stdout ?? ""}${e.stderr ?? ""}`); }
ok("build");
const packDir = mkdtempSync(join(tmpdir(), "ga-publish-"));
// tsc is passed explicitly: verify-published spawns it by name, and a bare `node scripts/…`
// has no node_modules/.bin on PATH (only `pnpm <script>` adds it).
const tsc = existsSync(join(ROOT, "node_modules", ".bin", "tsc")) ? join(ROOT, "node_modules", ".bin", "tsc") : "tsc";
const verify = (target) => execFileSync(
  process.execPath,
  [join(ROOT, "scripts", "verify-published.mjs"), target, `--tsc=${tsc}`],
  { cwd: ROOT, encoding: "utf8", stdio: "inherit" },
);
try {
  sh("pnpm", ["pack", "--pack-destination", packDir], { cwd: DIR });
  const tgz = readdirSync(packDir).filter((f) => f.endsWith(".tgz"));
  if (tgz.length !== 1) die(`expected one tarball, found ${tgz.length}`);
  const tarball = join(packDir, tgz[0]);
  ok(`packed ${tgz[0]}`);
  console.log("\nverifying the tarball…");
  try { verify(`--tarball=${tarball}`); } catch { die("tarball verification failed — nothing was published"); }
  if (!shouldPublish) {
    console.log("\npreflight only. Nothing was published.");
    console.log("to publish this tarball:  NPM_TOKEN=<automation token> pnpm publish:npm --publish");
    process.exit(0);
  }
  // 5) Publish with the token in a throwaway npmrc — never in the repo, never in an argv.
  // Order matters: the account has 2FA on, so only a token with "bypass 2FA" can publish. A plain
  // token authenticates fine (`npm whoami` works) and is then refused with 403 at the PUT.
  const token = process.env.NPM_TOKEN_PUBLISH || process.env.DSH_SECRET_NPM_TOKEN_PUBLISH
    || process.env.NPM_TOKEN || process.env.DSH_SECRET_NPM_TOKEN;
  if (!token) die("no publish token (set NPM_TOKEN_PUBLISH — the account has 2FA, so the token must bypass it)");
  const npmrc = join(packDir, ".npmrc");
  writeFileSync(npmrc, `//registry.npmjs.org/:_authToken=${token}\n`);
  chmodSync(npmrc, 0o600);
  console.log(`\npublishing ${PKG}@${version}…`);
  try {
    sh("npm", ["publish", tarball, "--access", "public", "--userconfig", npmrc, "--no-audit", "--no-fund"]);
  } finally { rmSync(npmrc, { force: true }); }
  ok("published");
  // 6) Verify what npm serves, not what we built. The registry can lag for a few seconds.
  console.log("\nverifying the registry copy…");
  let good = false;
  for (let i = 0; i < 12 && !good; i += 1) {
    try { verify(`--spec=${PKG}@${version}`); good = true; } catch {
      info(`registry not ready (${i + 1}/12), retrying in 5s…`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  if (!good) die("published, but the registry copy failed verification");
  console.log(`\nDONE  https://www.npmjs.com/package/${PKG}/v/${version}`);
  if (!onOrigin) console.log(`now the tag, which is local only:  git push origin ${tag}`);
} finally { rmSync(packDir, { recursive: true, force: true }); }
