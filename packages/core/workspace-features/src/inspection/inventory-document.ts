import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  ExtensionTypeSchema,
  extensionTypeToPlural,
} from "@agentxm/extension-model/unstable/extensions";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import { combineNativeLocationOutcomes } from "@agentxm/workspace-kernel/locations";
import {
  DesiredStateReader,
  LockfileReader,
  ExtensionInventoryRowSchema,
  ExtensionInventorySchema,
  ExtensionInventoryLifecycleSchema,
  desiredIdentityFqn,
  desiredMcpSourceKey,
  formatDesiredIdentity,
  lockEntryToSourceParams,
  lockEntryVersion,
  type DesiredExtensionNode,
  type ExtensionInventory,
  type ExtensionInventoryRow,
  type LockEntry,
} from "@agentxm/workspace-kernel/workspace-state";

/** Acquisition authority, distinct from workspace management and native placement. */
export const ExtensionListSourceSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("registry"),
    locator: Schema.String,
    identity: Schema.String,
  }),
  Schema.Struct({ kind: Schema.Literals(["git", "http", "path"]), locator: Schema.String }),
  Schema.Struct({
    kind: Schema.Literals(["workspace", "bundled"]),
    locator: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({ kind: Schema.Literals(["inline", "unmanaged"]) }),
  Schema.Struct({ kind: Schema.Literal("unknown"), locator: Schema.optionalKey(Schema.String) }),
]);
export type ExtensionListSource = typeof ExtensionListSourceSchema.Type;

export const ExtensionListItemSchema = Schema.Struct({
  type: ExtensionTypeSchema,
  name: Schema.String,
  scope: ExtensionInventoryRowSchema.fields.scope,
  fqn: Schema.optionalKey(Schema.String),
  management: ExtensionInventoryLifecycleSchema,
  installed: Schema.Boolean,
  enabled: Schema.NullOr(Schema.Boolean),
  version: Schema.optionalKey(Schema.String),
  source: ExtensionListSourceSchema,
  agentOutcomes: ExtensionInventoryRowSchema.fields.agentOutcomes,
  nativeLocations: ExtensionInventoryRowSchema.fields.nativeLocations,
  duplicateDiscoveries: ExtensionInventoryRowSchema.fields.duplicateDiscoveries,
  // Sourced Rule/Hook and Pack inventory facts extend the common core.
  locked: Schema.optionalKey(Schema.Boolean),
  owner: Schema.optionalKey(Schema.String),
});
export type ExtensionListItem = typeof ExtensionListItemSchema.Type;

export const ExtensionInventoryDocumentFields = {
  filter: Schema.Literals(["all", "outdated", "deprecated"]),
  count: Schema.Number,
  totalCount: Schema.Number,
  managementCounts: Schema.Struct({
    configured: Schema.Number,
    implicit: Schema.Number,
    leftover: Schema.Number,
    undeclared: Schema.Number,
    unmanaged: Schema.Number,
  }),
  nativeLocationCounts: ExtensionInventorySchema.fields.nativeLocationCounts,
} as const;

export const ExtensionInventoryDocumentSchema = Schema.Struct({
  ...ExtensionInventoryDocumentFields,
  items: Schema.Array(ExtensionListItemSchema),
});
export type ExtensionInventoryDocument = typeof ExtensionInventoryDocumentSchema.Type;

export const inventoryEnvelope = <Item extends ExtensionListItem>(
  items: ReadonlyArray<Item>,
  totalCount: number,
  filter: ExtensionInventoryDocument["filter"] = "all",
) => {
  const countManagement = (management: ExtensionListItem["management"]) =>
    items.filter((item) => item.management === management).length;
  const native = combineNativeLocationOutcomes(items.flatMap((item) => item.nativeLocations ?? []));
  return {
    filter,
    items,
    count: items.length,
    totalCount,
    managementCounts: {
      configured: countManagement("configured"),
      implicit: countManagement("implicit"),
      leftover: countManagement("leftover"),
      undeclared: countManagement("undeclared"),
      unmanaged: countManagement("unmanaged"),
    },
    ...(items.some((item) => item.nativeLocations !== undefined)
      ? {
          nativeLocationCounts: {
            units: native.length,
            physicalLocations: new Set(
              native.map((unit) => JSON.stringify([unit.scope, unit.address.path])),
            ).size,
            configuredConsumers: new Set(native.flatMap((unit) => unit.configuredConsumers)).size,
            unverifiedExtensions: items.filter(
              (item) => item.type !== "pack" && item.nativeLocations === undefined,
            ).length,
          },
        }
      : {}),
  };
};

const sourceFor = (
  row: ExtensionInventoryRow,
  node: DesiredExtensionNode | undefined,
  locked: LockEntry | undefined,
): ExtensionListSource => {
  if (node !== undefined) {
    const identity = node.identity;
    switch (identity.authority) {
      case "inline":
        return { kind: "inline" };
      case "workspace":
      case "bundled":
        return {
          kind: identity.authority,
          locator: node.source ?? formatDesiredIdentity(identity),
        };
      case "registry":
        return {
          kind: "registry",
          locator: node.source ?? identity.fqn,
          identity: desiredMcpSourceKey(identity),
        };
      case "git":
      case "http":
      case "path":
        return { kind: identity.authority, locator: node.source ?? identity.locator };
    }
  }
  if (locked !== undefined) {
    const locator = printSourceParams(lockEntryToSourceParams(locked));
    return locked.source.type === "registry"
      ? {
          kind: "registry",
          locator,
          identity: `${locked.identity.owner}/${extensionTypeToPlural[row.type]}/${locked.identity.name}`,
        }
      : { kind: locked.source.type, locator };
  }
  if (row.classification.lifecycle === "undeclared") return { kind: "workspace" };
  if (row.classification.lifecycle === "unmanaged") return { kind: "unmanaged" };
  return { kind: "unknown", ...(row.source === undefined ? {} : { locator: row.source }) };
};

/** Project the internal read model explicitly; internal discriminators never reach stdout. */
export const buildInventoryDocument = Effect.fn("Inspection.buildInventoryDocument")(function* (
  inventory: ExtensionInventory,
) {
  const graph = yield* (yield* DesiredStateReader).graph();
  const lockfile = yield* LockfileReader;
  const items = yield* Effect.forEach(inventory.items, (row) =>
    Effect.gen(function* () {
      const node = graph.nodes.find(
        (candidate) => candidate.type === row.type && candidate.name === row.name,
      );
      const locked = Option.getOrUndefined(yield* lockfile.acceptedEntry(row.type, row.name));
      const fqn =
        node === undefined
          ? locked?.identity.owner === undefined
            ? undefined
            : `${locked.identity.owner}/${extensionTypeToPlural[row.type]}/${locked.identity.name}`
          : Option.getOrUndefined(desiredIdentityFqn(node.identity));
      const version =
        locked === undefined ? row.version : (lockEntryVersion(locked) ?? row.version);
      return {
        type: row.type,
        name: row.name,
        scope: row.scope,
        ...(fqn === undefined ? {} : { fqn }),
        management: row.classification.lifecycle,
        installed: row.installed,
        enabled: row.enabled,
        ...(version === undefined || version === "n/a" ? {} : { version }),
        source: sourceFor(row, node, locked),
        agentOutcomes: row.agentOutcomes,
        ...(row.locked === undefined ? {} : { locked: row.locked }),
        ...(row.owner === undefined || row.owner === "n/a" ? {} : { owner: row.owner }),
        ...(row.nativeLocations === undefined ? {} : { nativeLocations: row.nativeLocations }),
        ...(row.duplicateDiscoveries === undefined
          ? {}
          : { duplicateDiscoveries: row.duplicateDiscoveries }),
      } satisfies ExtensionListItem;
    }),
  );
  return inventoryEnvelope(items, inventory.count) satisfies ExtensionInventoryDocument;
});
