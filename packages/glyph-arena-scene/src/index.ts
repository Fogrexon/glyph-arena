const nodeKey = Symbol("node");

interface NodeInternal {
  readonly [nodeKey]: { forestId: number; id: number };
}

export type Node = NodeInternal;

export type Forest = {
  create: () => Node;
  destroy: (node: Node) => void;
  setParent: (child: Node, parent: Node | null) => void;
  parent: (node: Node) => Node | null;
  children: (node: Node) => readonly Node[];
  dispose: () => void;
};

type NodeRecord = {
  parent: number | null;
  children: number[];
};

let nextForestId = 0;

function nodeRef(node: Node): { forestId: number; id: number } | null {
  return (node as NodeInternal)[nodeKey] ?? null;
}

export function createForest(): Forest {
  const forestId = ++nextForestId;
  let disposed = false;
  let nextId = 1;
  const recycledIds: number[] = [];
  const records = new Map<number, NodeRecord>();
  const nodeCache = new Map<number, Node>();

  const allocateId = (): number => {
    if (recycledIds.length > 0) {
      return recycledIds.pop()!;
    }
    return nextId++;
  };

  const wrapNode = (id: number): Node => {
    let node = nodeCache.get(id);
    if (node === undefined) {
      node = { [nodeKey]: { forestId, id } };
      nodeCache.set(id, node);
    }
    return node;
  };

  const releaseNode = (id: number): void => {
    nodeCache.delete(id);
  };

  const isValid = (node: Node): boolean => {
    if (disposed) {
      return false;
    }

    const ref = nodeRef(node);
    if (ref === null || ref.forestId !== forestId) {
      return false;
    }

    return records.has(ref.id);
  };

  const removeFromParent = (childId: number, parentId: number | null): void => {
    if (parentId === null) {
      return;
    }

    const parentRecord = records.get(parentId);
    if (parentRecord === undefined) {
      return;
    }

    const index = parentRecord.children.indexOf(childId);
    if (index !== -1) {
      parentRecord.children.splice(index, 1);
    }
  };

  const collectSubtreeIds = (rootId: number): number[] => {
    const collected: number[] = [];
    const stack = [rootId];

    while (stack.length > 0) {
      const id = stack.pop()!;
      collected.push(id);

      const record = records.get(id);
      if (record !== undefined) {
        for (const childId of record.children) {
          stack.push(childId);
        }
      }
    }

    return collected;
  };

  const wouldCreateCycle = (childId: number, parentId: number): boolean => {
    if (childId === parentId) {
      return true;
    }

    let current: number | null = parentId;
    while (current !== null) {
      if (current === childId) {
        return true;
      }

      const record = records.get(current);
      current = record?.parent ?? null;
    }

    return false;
  };

  const create = (): Node => {
    const id = allocateId();

    if (!disposed) {
      records.set(id, { parent: null, children: [] });
    }

    return wrapNode(id);
  };

  const destroy = (node: Node): void => {
    if (!isValid(node)) {
      return;
    }

    const childId = nodeRef(node)!.id;
    const record = records.get(childId)!;

    removeFromParent(childId, record.parent);

    const subtreeIds = collectSubtreeIds(childId);
    for (const id of subtreeIds) {
      records.delete(id);
      releaseNode(id);
      recycledIds.push(id);
    }
  };

  const setParent = (child: Node, parent: Node | null): void => {
    if (!isValid(child)) {
      return;
    }

    const childId = nodeRef(child)!.id;
    const childRecord = records.get(childId)!;

    if (parent !== null && !isValid(parent)) {
      return;
    }

    const newParentId = parent === null ? null : nodeRef(parent)!.id;

    if (newParentId !== null && wouldCreateCycle(childId, newParentId)) {
      return;
    }

    if (childRecord.parent === newParentId) {
      if (newParentId === null) {
        return;
      }

      const parentRecord = records.get(newParentId)!;
      if (parentRecord.children[parentRecord.children.length - 1] === childId) {
        return;
      }
    }

    removeFromParent(childId, childRecord.parent);
    childRecord.parent = newParentId;

    if (newParentId !== null) {
      records.get(newParentId)!.children.push(childId);
    }
  };

  const parent = (node: Node): Node | null => {
    if (!isValid(node)) {
      return null;
    }

    const record = records.get(nodeRef(node)!.id)!;
    if (record.parent === null) {
      return null;
    }

    return wrapNode(record.parent);
  };

  const children = (node: Node): readonly Node[] => {
    if (!isValid(node)) {
      return [];
    }

    const record = records.get(nodeRef(node)!.id)!;
    return record.children.map((id) => wrapNode(id));
  };

  const dispose = (): void => {
    if (disposed) {
      return;
    }

    disposed = true;
    records.clear();
    recycledIds.length = 0;
    nodeCache.clear();
  };

  return {
    create,
    destroy,
    setParent,
    parent,
    children,
    dispose,
  };
}
