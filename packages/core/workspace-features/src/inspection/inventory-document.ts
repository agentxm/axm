import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  inspectKnowledgePackage,
  readKnowledgePackageManifest,
} from "@agentxm/extension-content/knowledge";
import { resolveKnowledgeInstructionEntry } from "@agentxm/workspace-kernel/projection";
import * as Schema from "effect/Schema";
import {
  ExtensionTypeSchema,
  extensionTypeToPlural,
} from "@agentxm/extension-model/unstable/extensions";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import { combineNativeLocationOutcomes } from "@agentxm/workspace-kernel/locations";
import {
  DesiredStateReader,
  SettingsReader,
  WorkspaceLocation,
  LockfileReader,
  ExtensionInventoryRowSchema,
  ExtensionInventorySchema,
  ExtensionInventoryLifecycleSchema,
  desiredIdentityFqn,
  formatDesiredIdentity,
  lockEntryToSourceParams,
  lockEntryVersion,
  type DesiredExtensionNode,
  type ExtensionInventory,
  type ExtensionInventoryRow,
  type LockEntry,
} from "@agentxm/workspace-kernel/workspace-state";

/** Acquisition authority, distinct from workspace management and native placement. */
const ExtensionListSourceSchema = Schema.Union([
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

const InstructionEntrySchema = Schema.Struct({
  included: Schema.Boolean,
  reason: Schema.Literals([
    "bundle-disabled",
    "instruction-files-not-configured",
    "instruction-files-disabled",
    "knowledge-instructions-disabled",
    "workspace-excluded",
    "manifest-excluded",
    "included",
  ]),
});
const InspectionSchema = Schema.Union([
  Schema.Struct({ state: Schema.Literals(["not-requested", "not-applicable"]) }),
  Schema.Struct({
    state: Schema.Literals(["complete", "partial"]),
    agentOutcomes: ExtensionInventoryRowSchema.fields.agentOutcomes,
    nativeLocations: ExtensionInventoryRowSchema.fields.nativeLocations,
    duplicateDiscoveries: ExtensionInventoryRowSchema.fields.duplicateDiscoveries,
    diagnostics: Schema.Array(Schema.String),
    knowledge: Schema.optionalKey(
      Schema.Struct({ concepts: Schema.Number, diagnostics: Schema.Number }),
    ),
  }),
]);

export const ExtensionListItemSchema = Schema.Struct({
  type: ExtensionTypeSchema,
  name: Schema.String,
  scope: ExtensionInventoryRowSchema.fields.scope,
  fqn: Schema.optionalKey(Schema.String),
  management: ExtensionInventoryLifecycleSchema,
  installed: Schema.NullOr(Schema.Boolean),
  enabled: Schema.NullOr(Schema.Boolean),
  version: Schema.optionalKey(Schema.String),
  source: ExtensionListSourceSchema,
  agents: Schema.Struct({
    configured: Schema.Array(Schema.String),
    observed: Schema.Array(Schema.String),
  }),
  inspection: InspectionSchema,
  observationDiagnostics: ExtensionInventoryRowSchema.fields.observationDiagnostics,
  sourceRoot: Schema.optionalKey(Schema.String),
  instructionEntry: Schema.optionalKey(InstructionEntrySchema),
  // Sourced Rule/Hook and Pack inventory facts extend the common core.
  locked: Schema.optionalKey(Schema.Boolean),
  owner: Schema.optionalKey(Schema.String),
});
export type ExtensionListItem = typeof ExtensionListItemSchema.Type;

export const ExtensionInventoryDocumentFields = {
  filter: Schema.Literals(["all", "outdated", "deprecated", "archived", "lifecycle"]),
  count: Schema.Number,
  totalCount: Schema.Number,
  observationDiagnostics: ExtensionInventorySchema.fields.observationDiagnostics,
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
  observationDiagnostics?: ExtensionInventory["observationDiagnostics"],
) => {
  const countManagement = (management: ExtensionListItem["management"]) =>
    items.filter((item) => item.management === management).length;
  const native = combineNativeLocationOutcomes(
    items.flatMap((item) =>
      "nativeLocations" in item.inspection ? (item.inspection.nativeLocations ?? []) : [],
    ),
  );
  return {
    filter,
    items,
    ...(observationDiagnostics === undefined ? {} : { observationDiagnostics }),
    count: items.length,
    totalCount,
    managementCounts: {
      configured: countManagement("configured"),
      implicit: countManagement("implicit"),
      leftover: countManagement("leftover"),
      undeclared: countManagement("undeclared"),
      unmanaged: countManagement("unmanaged"),
    },
    ...(items.some(
      (item) =>
        "nativeLocations" in item.inspection && item.inspection.nativeLocations !== undefined,
    )
      ? {
          nativeLocationCounts: {
            units: native.length,
            physicalLocations: new Set(
              native.map((unit) => JSON.stringify([unit.scope, unit.address.path])),
            ).size,
            configuredConsumers: new Set(native.flatMap((unit) => unit.configuredConsumers)).size,
            unverifiedExtensions: items.filter(
              (item) =>
                item.type !== "pack" &&
                (!("nativeLocations" in item.inspection) ||
                  item.inspection.nativeLocations === undefined),
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
        return { kind: "registry", locator: node.source ?? identity.fqn, identity: identity.fqn };
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
export const buildInventoryDocument = Effect.fnUntraced(function* (inventory: ExtensionInventory) {
  const graph = yield* (yield* DesiredStateReader).graph();
  const lockfile = yield* LockfileReader;
  const settings = yield* SettingsReader;
  const location = yield* WorkspaceLocation;
  const path = yield* Path.Path;
  const configuredAgents = yield* settings.configuredAgents;
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
      let inspection: ExtensionListItem["inspection"] =
        row.inspectionState === undefined
          ? { state: "not-requested" }
          : row.inspectionState === "not-applicable"
            ? { state: "not-applicable" }
            : {
                state: row.inspectionState,
                agentOutcomes: row.agentOutcomes,
                diagnostics: row.inspectionDiagnostics ?? [],
                ...(row.nativeLocations === undefined
                  ? {}
                  : { nativeLocations: row.nativeLocations }),
                ...(row.duplicateDiscoveries === undefined
                  ? {}
                  : { duplicateDiscoveries: row.duplicateDiscoveries }),
              };
      let knowledge: Pick<ExtensionListItem, "sourceRoot" | "instructionEntry"> = {};
      if (row.type === "knowledge") {
        const packageRoot =
          row.paths[0] === undefined ? undefined : path.resolve(location.baseDir, row.paths[0]);
        const read =
          packageRoot === undefined || row.installed !== true
            ? undefined
            : row.inspectionState === undefined
              ? yield* readKnowledgePackageManifest(packageRoot).pipe(
                  Effect.map((value) => ({ ...value, inspection: undefined })),
                  Effect.result,
                )
              : yield* inspectKnowledgePackage(packageRoot).pipe(Effect.result);
        const bundle = read?._tag === "Success" ? read.success : undefined;
        if (inspection.state === "complete" || inspection.state === "partial") {
          inspection =
            read?._tag === "Failure"
              ? {
                  ...inspection,
                  state: "partial",
                  diagnostics: [
                    ...inspection.diagnostics,
                    `Knowledge contents could not be inspected: ${String(read.failure)}`,
                  ],
                }
              : {
                  ...inspection,
                  ...(bundle?.inspection === undefined
                    ? {}
                    : {
                        knowledge: {
                          concepts: bundle.inspection.concepts.length,
                          diagnostics: bundle.inspection.diagnostics.length,
                        },
                      }),
                };
        }
        const configured = yield* settings.entries("knowledge");
        const workspaceInstructionEntry = configured[row.name]?.instructionEntry;
        const discovery = yield* settings.knowledgeDiscoveryConfig;
        const instructions = yield* settings.instructionsConfig;
        knowledge = {
          ...(packageRoot === undefined ? {} : { sourceRoot: path.join(packageRoot, "src") }),
          ...(node === undefined || (row.enabled !== false && bundle === undefined)
            ? {}
            : {
                instructionEntry: resolveKnowledgeInstructionEntry({
                  bundleEnabled: row.enabled !== false,
                  instructionFilesEnabled:
                    Option.isSome(instructions) && instructions.value !== false,
                  instructionFilesUndecided: Option.isNone(instructions),
                  knowledgeInstructionsEnabled: discovery.instructions,
                  ...(workspaceInstructionEntry === undefined ? {} : { workspaceInstructionEntry }),
                  ...(bundle?.manifest.instructionEntry === undefined
                    ? {}
                    : { manifestInstructionEntry: bundle.manifest.instructionEntry }),
                }),
              }),
        };
      }
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
        agents: {
          configured: row.configuredAgents ?? (node === undefined ? [] : configuredAgents),
          observed: row.observedAgents ?? [],
        },
        inspection,
        ...knowledge,
        ...(row.observationDiagnostics === undefined
          ? {}
          : { observationDiagnostics: row.observationDiagnostics }),
        ...(row.locked === undefined ? {} : { locked: row.locked }),
        ...(row.owner === undefined || row.owner === "n/a" ? {} : { owner: row.owner }),
      } satisfies ExtensionListItem;
    }),
  );
  return inventoryEnvelope(
    items,
    inventory.count,
    "all",
    inventory.observationDiagnostics,
  ) satisfies ExtensionInventoryDocument;
});
