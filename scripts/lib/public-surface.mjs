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

/**
 * The same surface, with each name's kind, so a documentation table can be generated from the
 * source instead of being typed out. A typed-out table is a count that goes wrong the day a
 * package gains a function — the same failure the umbrella's export list and the deploy build had.
 *
 * `kind` is the declaration the name came from: `function`, `const`, `class`, `type`, `interface`
 * or `enum`. A name from an `export { … }` list has no local declaration to read, so it is
 * reported as `value` and its table row says so honestly rather than guessing.
 */
export function exportedDeclarations(source) {
  const declarations = new Map();

  const declaration =
    /^export\s+(?:async\s+)?(function|const|let|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm;
  for (const match of source.matchAll(declaration)) {
    const kind = match[1] === "let" ? "const" : match[1];
    declarations.set(match[2], kind);
  }

  const list = /^export\s*\{([^}]*)\}/gm;
  for (const match of source.matchAll(list)) {
    for (const part of match[1].split(",")) {
      const exported = part.trim().split(/\s+as\s+/).pop();
      if (exported && !declarations.has(exported)) declarations.set(exported, "value");
    }
  }

  return [...declarations.entries()]
    .map(([name, kind]) => ({ name, kind }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
