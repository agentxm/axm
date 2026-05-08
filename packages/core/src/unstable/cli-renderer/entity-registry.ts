import type { DetailView, TableView, TreeDef } from "./cli-renderer.js";

export interface EntityView<T extends object> {
  readonly list?: {
    readonly columns: TableView<T>["columns"];
    readonly emptyMessage?: string;
  };
  readonly detail?: {
    readonly fields: DetailView<T>["fields"];
    readonly title?: (item: T) => string;
  };
  readonly tree?: TreeDef<T>;
}

const entityRegistry = new Map<string, EntityView<object>>();

export const registerEntity = <T extends object>(name: string, view: EntityView<T>): void => {
  // Assertion needed: registry erases entity-specific item types until a renderer
  // looks up the view with the matching payload type.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  entityRegistry.set(name, view as unknown as EntityView<object>);
};

export const getEntityView = <T extends object>(name: string): EntityView<T> | undefined => {
  const view = entityRegistry.get(name);
  if (view === undefined) {
    return undefined;
  }
  // Assertion needed: callers choose T from the payload they render for this entity.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return view as unknown as EntityView<T>;
};
