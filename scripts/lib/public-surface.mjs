/**
 * The names a module exports, read from its source.
 *
 * Package tests used to forbid *words* — `follow`, `bounds`, `shake`, `layers` and 35 more across
 * 12 packages — so a package could not answer a request without turning red. The list was checking
 * vocabulary, not the thing that actually goes wrong: a public name appearing without anyone
 * deciding it should.
 *
 * What this reads is the surface: every `export function|const|class|type|interface|enum NAME`, and
 * every name in an `export { … }` list (with `as` renames resolved to the exported name). Bodies are
 * not parsed, so a word used inside a function is not a name and cannot trip the check.
 */
export function exportedNames(source) {
  const names = new Set();

  const declaration =
    /^export\s+(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm;
  for (const match of source.matchAll(declaration)) names.add(match[1]);

  const list = /^export\s*\{([^}]*)\}/gm;
  for (const match of source.matchAll(list)) {
    for (const part of match[1].split(",")) {
      const exported = part.trim().split(/\s+as\s+/).pop();
      if (exported) names.add(exported);
    }
  }

  return [...names].sort();
}
