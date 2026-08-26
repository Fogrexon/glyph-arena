export type Entity = number;

export type World = {
  spawn: () => Entity;
  despawn: (entity: Entity) => void;
  set: (entity: Entity, key: string, value: unknown) => void;
  get: (entity: Entity, key: string) => unknown | undefined;
  has: (entity: Entity, key: string) => boolean;
  remove: (entity: Entity, key: string) => void;
  dispose: () => void;
};

const isValidKey = (key: string): boolean => key !== "";

export function createWorld(): World {
  let disposed = false;
  let nextId = 1;
  const freeIds: Entity[] = [];
  const components = new Map<Entity, Map<string, unknown>>();

  const allocateId = (): Entity => {
    if (freeIds.length > 0) {
      return freeIds.pop()!;
    }

    return nextId++;
  };

  const spawn = (): Entity => {
    const entity = allocateId();

    if (disposed) {
      return entity;
    }

    components.set(entity, new Map());
    return entity;
  };

  const despawn = (entity: Entity): void => {
    if (disposed) {
      return;
    }

    if (!components.has(entity)) {
      return;
    }

    components.delete(entity);
    freeIds.push(entity);
  };

  const set = (entity: Entity, key: string, value: unknown): void => {
    if (disposed || !isValidKey(key)) {
      return;
    }

    if (value === undefined) {
      remove(entity, key);
      return;
    }

    const entityComponents = components.get(entity);
    if (entityComponents === undefined) {
      return;
    }

    entityComponents.set(key, value);
  };

  const get = (entity: Entity, key: string): unknown | undefined => {
    if (!isValidKey(key)) {
      return undefined;
    }

    const entityComponents = components.get(entity);
    if (entityComponents === undefined) {
      return undefined;
    }

    return entityComponents.get(key);
  };

  const has = (entity: Entity, key: string): boolean => {
    if (!isValidKey(key)) {
      return false;
    }

    const entityComponents = components.get(entity);
    if (entityComponents === undefined) {
      return false;
    }

    return entityComponents.has(key);
  };

  const remove = (entity: Entity, key: string): void => {
    if (disposed || !isValidKey(key)) {
      return;
    }

    const entityComponents = components.get(entity);
    if (entityComponents === undefined) {
      return;
    }

    entityComponents.delete(key);
  };

  const dispose = (): void => {
    if (disposed) {
      return;
    }

    disposed = true;
    components.clear();
    freeIds.length = 0;
  };

  return {
    spawn,
    despawn,
    set,
    get,
    has,
    remove,
    dispose,
  };
}
