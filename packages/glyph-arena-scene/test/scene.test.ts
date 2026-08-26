import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createForest } from "../src/index.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("createForest", () => {
  it("create makes a root with parent null", () => {
    const forest = createForest();
    const root = forest.create();

    assert.equal(forest.parent(root), null);
    assert.deepEqual(forest.children(root), []);
  });

  it("setParent attaches child to parent and appends to end", () => {
    const forest = createForest();
    const parent = forest.create();
    const first = forest.create();
    const second = forest.create();

    forest.setParent(first, parent);
    forest.setParent(second, parent);

    assert.equal(forest.parent(first), parent);
    assert.equal(forest.parent(second), parent);
    assert.deepEqual(forest.children(parent), [first, second]);
  });

  it("setParent null re-roots a child", () => {
    const forest = createForest();
    const parent = forest.create();
    const child = forest.create();

    forest.setParent(child, parent);
    assert.equal(forest.parent(child), parent);
    assert.deepEqual(forest.children(parent), [child]);

    forest.setParent(child, null);
    assert.equal(forest.parent(child), null);
    assert.deepEqual(forest.children(parent), []);
  });

  it("setParent is a move: leaves old parent and appends to new parent end", () => {
    const forest = createForest();
    const oldParent = forest.create();
    const newParent = forest.create();
    const sibling = forest.create();
    const child = forest.create();

    forest.setParent(sibling, newParent);
    forest.setParent(child, oldParent);
    assert.deepEqual(forest.children(oldParent), [child]);

    forest.setParent(child, newParent);
    assert.deepEqual(forest.children(oldParent), []);
    assert.deepEqual(forest.children(newParent), [sibling, child]);
    assert.equal(forest.parent(child), newParent);
  });

  it("setParent within same parent moves child to end", () => {
    const forest = createForest();
    const parent = forest.create();
    const first = forest.create();
    const second = forest.create();
    const third = forest.create();

    forest.setParent(first, parent);
    forest.setParent(second, parent);
    forest.setParent(third, parent);
    assert.deepEqual(forest.children(parent), [first, second, third]);

    forest.setParent(first, parent);
    assert.deepEqual(forest.children(parent), [second, third, first]);
  });

  it("parent returns the current parent", () => {
    const forest = createForest();
    const parent = forest.create();
    const child = forest.create();

    forest.setParent(child, parent);
    assert.equal(forest.parent(child), parent);
    assert.equal(forest.parent(parent), null);
  });

  it("children returns a copy", () => {
    const forest = createForest();
    const parent = forest.create();
    const child = forest.create();

    forest.setParent(child, parent);
    const snapshot = forest.children(parent);

    assert.notEqual(snapshot, forest.children(parent));
    assert.deepEqual(snapshot, [child]);

    const mutable = [...snapshot];
    mutable.push(forest.create());
    assert.deepEqual(forest.children(parent), [child]);
  });

  it("destroy removes the subtree", () => {
    const forest = createForest();
    const root = forest.create();
    const child = forest.create();
    const grandchild = forest.create();

    forest.setParent(child, root);
    forest.setParent(grandchild, child);

    forest.destroy(child);
    assert.deepEqual(forest.children(root), []);
    assert.equal(forest.parent(child), null);
    assert.deepEqual(forest.children(child), []);
    assert.equal(forest.parent(grandchild), null);
    assert.deepEqual(forest.children(grandchild), []);
  });

  it("destroy removes node from parent children", () => {
    const forest = createForest();
    const parent = forest.create();
    const child = forest.create();

    forest.setParent(child, parent);
    forest.destroy(child);

    assert.deepEqual(forest.children(parent), []);
  });

  it("cyclic setParent is a no-op including setParent to self", () => {
    const forest = createForest();
    const root = forest.create();
    const child = forest.create();
    const grandchild = forest.create();

    forest.setParent(child, root);
    forest.setParent(grandchild, child);

    forest.setParent(root, root);
    assert.equal(forest.parent(root), null);
    assert.deepEqual(forest.children(root), [child]);

    forest.setParent(root, grandchild);
    assert.equal(forest.parent(root), null);
    assert.deepEqual(forest.children(root), [child]);
    assert.equal(forest.parent(child), root);
    assert.equal(forest.parent(grandchild), child);

    forest.setParent(child, child);
    assert.equal(forest.parent(child), root);
    assert.deepEqual(forest.children(root), [child]);
  });

  it("setParent to a missing parent is a no-op", () => {
    const forest = createForest();
    const parent = forest.create();
    const child = forest.create();
    const other = forest.create();

    forest.setParent(child, parent);
    forest.destroy(other);

    forest.setParent(child, other);
    assert.equal(forest.parent(child), parent);
    assert.deepEqual(forest.children(parent), [child]);
  });

  it("only null makes a root; missing parent does not re-root", () => {
    const forest = createForest();
    const parent = forest.create();
    const child = forest.create();

    forest.setParent(child, parent);
    const missing = forest.create();
    forest.destroy(missing);

    forest.setParent(child, missing);
    assert.equal(forest.parent(child), parent);
    assert.deepEqual(forest.children(parent), [child]);
  });

  it("missing node operations are no-ops", () => {
    const forest = createForest();
    const parent = forest.create();
    const child = forest.create();
    const missing = forest.create();

    forest.setParent(child, parent);
    forest.destroy(missing);

    forest.destroy(missing);
    forest.setParent(missing, parent);
    forest.setParent(child, missing);

    assert.equal(forest.parent(missing), null);
    assert.deepEqual(forest.children(missing), []);
    assert.equal(forest.parent(child), parent);
    assert.deepEqual(forest.children(parent), [child]);
  });

  it("node from another forest is treated as missing", () => {
    const forestA = createForest();
    const forestB = createForest();

    const parentA = forestA.create();
    const childA = forestA.create();
    const nodeB = forestB.create();

    forestA.setParent(childA, parentA);

    forestA.setParent(nodeB, parentA);
    forestA.setParent(childA, nodeB);

    assert.equal(forestA.parent(nodeB), null);
    assert.deepEqual(forestA.children(nodeB), []);
    assert.equal(forestA.parent(childA), parentA);
    assert.deepEqual(forestA.children(parentA), [childA]);

    assert.equal(forestB.parent(nodeB), null);
    assert.deepEqual(forestB.children(nodeB), []);
  });

  it("operations on destroyed nodes are no-ops", () => {
    const forest = createForest();
    const parent = forest.create();
    const child = forest.create();

    forest.setParent(child, parent);
    forest.destroy(child);

    forest.destroy(child);
    forest.setParent(child, parent);
    forest.setParent(child, null);

    assert.equal(forest.parent(child), null);
    assert.deepEqual(forest.children(child), []);
    assert.deepEqual(forest.children(parent), []);
  });

  it("destroyed ids may be reused", () => {
    const forest = createForest();
    const first = forest.create();
    const second = forest.create();

    forest.destroy(first);
    const reused = forest.create();

    assert.notEqual(first, reused);
    assert.equal(forest.parent(reused), null);
    assert.deepEqual(forest.children(reused), []);

    forest.setParent(reused, second);
    assert.equal(forest.parent(reused), second);
    assert.deepEqual(forest.children(second), [reused]);
  });

  it("after dispose invalid nodes behave as missing", () => {
    const forest = createForest();
    const parent = forest.create();
    const child = forest.create();

    forest.setParent(child, parent);

    forest.dispose();

    assert.equal(forest.parent(parent), null);
    assert.deepEqual(forest.children(parent), []);
    assert.equal(forest.parent(child), null);
    assert.deepEqual(forest.children(child), []);

    forest.destroy(parent);
    forest.setParent(child, parent);
    forest.setParent(child, null);

    const afterDispose = forest.create();
    assert.equal(forest.parent(afterDispose), null);
    assert.deepEqual(forest.children(afterDispose), []);

    assert.doesNotThrow(() => {
      forest.dispose();
    });
  });

  it("does not import sibling packages", () => {
    const source = readFileSync(join(packageRoot, "src", "index.ts"), "utf8");

    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-loop/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-input/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-timer/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-assets/);
  });

  it("does not include matrices, draw, ecs, transforms, draw order, or names", () => {
    const source = readFileSync(join(packageRoot, "src", "index.ts"), "utf8");

    assert.doesNotMatch(source, /\bmatrix/i);
    assert.doesNotMatch(source, /\bdraw\b/i);
    assert.doesNotMatch(source, /\bECS\b/);
    assert.doesNotMatch(source, /\bworldTransform\b/);
    assert.doesNotMatch(source, /\bdrawOrder\b/);
    assert.doesNotMatch(source, /\bname\b/i);
  });
});
