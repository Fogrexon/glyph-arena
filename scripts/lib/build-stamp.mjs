/**
 * "This build is older than the thing it was built from."
 *
 * Every browser gate in this repository reads a build: an `examples/<name>/dist`, or a fixture whose
 * program is extracted from a document. The gate has always trusted that build. When the source
 * changes and the build does not, the gate tests yesterday's artifact and says PASS — a green that
 * tells the reader "this is fixed" about code nobody built. QA hit exactly that on 2026-11-18: the
 * phone program's jump was disabled in `docs/tutorial.md`, the gate was run without a rebuild, and
 * all ten checks passed.
 *
 * So a build writes `.build-stamp.json` with a hash of its inputs, and a gate recomputes that hash
 * before it serves anything. A mismatch is a red with the reason in the message, not a silent PASS.
 *
 * The same applies to `packages/<name>/dist`: the workspace packages have no `prepack`, so
 * `pnpm pack` (and every gate that packs or compiles against a `dist`) ships whatever is on disk.
 * A package build therefore stamps itself too — `kind` is `package:<directory name>`.
 *
 * The hash covers the sources a build reads: the example or fixture's own files, the documents a
 * fixture is extracted from, every `packages/<name>/src`, and `pnpm-lock.yaml`. It deliberately does not
 * cover the toolchain's version numbers beyond that: a different vite patch that produces the same
 * program is not a stale build.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const STAMP_NAME = ".build-stamp.json";

/** Directories a build does not read: its own output, installed packages, and the gate's artifacts. */
const SKIPPED = new Set(["node_modules", "dist", ".vite", ".git", ".e2e-artifacts"]);

function collectFiles(path, files) {
  const stat = statSync(path);

  if (stat.isDirectory()) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (SKIPPED.has(entry.name)) continue;
      collectFiles(join(path, entry.name), files);
    }
    return;
  }

  files.push(path);
}

/** `package:<directory name>` — a workspace package's own build. */
const PACKAGE_PREFIX = "package:";

function packageNameOf(kind) {
  return kind.startsWith(PACKAGE_PREFIX) ? kind.slice(PACKAGE_PREFIX.length) : null;
}

/** How a kind is named in a failure: `packages/glyph-arena-draw`, `runner`, `tutorial`. */
function describeKind(kind) {
  const name = packageNameOf(kind);
  return name === null ? kind : `packages/${name}`;
}

/** Every workspace package, as a kind. Derived from `packages/`, never a hand-kept list. */
export function packageKinds(root) {
  const packagesDir = join(root, "packages");
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(packagesDir, entry.name, "package.json")))
    .map((entry) => `${PACKAGE_PREFIX}${entry.name}`)
    .sort();
}

/** The files a build of `kind` reads, as absolute paths that may not exist (they are filtered). */
export function inputsFor(kind, root) {
  const packagesDir = join(root, "packages");
  const packageSources = existsSync(packagesDir)
    ? readdirSync(packagesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(packagesDir, entry.name, "src"))
    : [];

  const shared = [...packageSources, join(root, "pnpm-lock.yaml")];

  const name = packageNameOf(kind);
  if (name !== null) {
    const dir = join(root, "packages", name);
    // The umbrella bundles its siblings: its build reads every `packages/<name>/src`, not just its
    // own. A sibling reads only itself, so editing one package does not mark the other 18 stale.
    const sources = name === "glyph-arena" ? packageSources : [join(dir, "src")];
    return [
      ...sources,
      join(dir, "package.json"),
      join(dir, "tsconfig.json"),
      join(dir, "tsconfig.build.json"),
      join(root, "tsconfig.base.json"),
      join(root, "pnpm-lock.yaml"),
    ];
  }

  if (kind === "tutorial") {
    return [join(root, "docs", "tutorial.md"), join(root, "fixtures", "tutorial"), ...shared];
  }

  if (kind === "readme") {
    return [join(root, "packages", "glyph-arena", "README.md"), join(root, "fixtures", "readme"), ...shared];
  }

  return [join(root, "examples", kind), ...shared];
}

/** Where a build of `kind` puts its output. */
export function distFor(kind, root) {
  const name = packageNameOf(kind);
  if (name !== null) return join(root, "packages", name, "dist");

  return kind === "tutorial" || kind === "readme"
    ? join(root, "fixtures", kind, "dist")
    : join(root, "examples", kind, "dist");
}

/** The hash a fresh build of `kind` would have right now. */
export function hashFor(kind, root) {
  const files = [];

  for (const input of inputsFor(kind, root)) {
    if (existsSync(input)) collectFiles(input, files);
  }

  // Sorted so the hash depends on the contents, not on the order a filesystem happens to list.
  files.sort();

  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(relative(root, file).split(sep).join("/"));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }

  return { hash: hash.digest("hex"), files: files.length };
}

/** Write the stamp next to the build. Called at the end of a build, never by a gate. */
export function writeStamp(kind, root, dist = distFor(kind, root)) {
  const { hash, files } = hashFor(kind, root);
  writeFileSync(
    join(dist, STAMP_NAME),
    `${JSON.stringify({ kind, hash, files, builtAt: new Date().toISOString() }, null, 2)}\n`,
  );
  return { hash, files };
}

/**
 * `null` when the build matches its inputs, or a sentence saying why it does not. A missing stamp
 * counts as stale: a build that predates this check cannot claim to be current.
 */
export function staleReason(kind, root, dist = distFor(kind, root)) {
  const stampPath = join(dist, STAMP_NAME);

  if (!stampPath || !existsSync(stampPath)) {
    return `the build of ${describeKind(kind)} at ${dist} has no ${STAMP_NAME}: it was built before this check existed, or by hand (run \`pnpm -r build\`)`;
  }

  let stamp;
  try {
    stamp = JSON.parse(readFileSync(stampPath, "utf8"));
  } catch {
    return `the ${STAMP_NAME} of ${describeKind(kind)} at ${dist} is not readable`;
  }

  const { hash, files } = hashFor(kind, root);
  if (stamp.hash === hash) return null;

  return (
    `the build of ${describeKind(kind)} at ${dist} is older than its sources ` +
    `(stamp ${String(stamp.hash).slice(0, 12)}, inputs now ${hash.slice(0, 12)} over ${files} file(s)) — ` +
    "run `pnpm -r build` before this gate, or it is testing an artifact nobody built"
  );
}

/**
 * Gate-side entry point: print the reason and exit 1 when the build is stale. Never throws, so a
 * gate cannot accidentally swallow it.
 */
export function requireFresh(kind, root, { dist = distFor(kind, root), external = undefined, label = describeKind(kind) } = {}) {
  if (external !== undefined) {
    console.log(`${label ?? kind}: external build at ${external} — stamp not checked (the caller pointed at it)`);
    return;
  }

  const reason = staleReason(kind, root, dist);
  if (reason === null) return;

  console.error(`FAIL ${label ?? kind}: ${reason}`);
  console.error(`::error::${reason}`);
  process.exit(1);
}

/**
 * Gate-side entry point for the gates that read `packages/<name>/dist` (they pack it, or compile against
 * the emitted declarations). Every package must be current, because these gates read all of them.
 */
export function requireFreshPackages(root, { label = "packages" } = {}) {
  const kinds = packageKinds(root);
  for (const kind of kinds) requireFresh(kind, root);
  console.log(`${label}: ${kinds.length} package build(s) match their sources`);
}
