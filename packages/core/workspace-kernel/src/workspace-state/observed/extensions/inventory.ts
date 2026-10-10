import {
  NativeLocationOutcomeSchema,
  combineNativeLocationOutcomes,
  nativeUnitReference,
  NativeUnitReferenceSchema,
  type NativeLocationOutcome,
} from "../../../locations/index.js";
import * as Schema from "effect/Schema";
import {
  ConfiguredAgentOutcomeSchema,
  type ConfiguredAgentOutcome,
} from "../../../operations/index.js";
import { WorkspaceRecordRowSchema, type WorkspaceRecordRow } from "../records.js";
import type { ExtensionInventoryLifecycle } from "../records.js";
export {
  ExtensionInventoryLifecycleSchema,
  ExtensionInventoryClassificationSchema,
  type ExtensionInventoryLifecycle,
  type ExtensionInventoryClassification,
} from "../records.js";

export const ExtensionInventoryRowSchema = Schema.Struct({
  ...WorkspaceRecordRowSchema.fields,
  agentOutcomes: Schema.Array(ConfiguredAgentOutcomeSchema),
  nativeLocations: Schema.optionalKey(Schema.Array(NativeLocationOutcomeSchema)),
  duplicateDiscoveries: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        agentId: Schema.String,
        nativeUnits: Schema.Array(NativeUnitReferenceSchema),
      }),
    ),
  ),
  version: Schema.optionalKey(Schema.String),
  owner: Schema.optionalKey(Schema.String),
  transport: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(Schema.String),
  locked: Schema.optionalKey(Schema.Boolean),
  sourceType: Schema.optionalKey(Schema.String),
});

export type ExtensionInventoryRow = typeof ExtensionInventoryRowSchema.Type;

export const ExtensionInventorySchema = Schema.Struct({
  items: Schema.Array(ExtensionInventoryRowSchema),
  count: Schema.Number,
  configuredCount: Schema.Number,
  implicitCount: Schema.Number,
  installedCount: Schema.Number,
  leftoverCount: Schema.Number,
  undeclaredCount: Schema.Number,
  unmanagedCount: Schema.Number,
  nativeLocationCounts: Schema.optionalKey(
    Schema.Struct({
      units: Schema.Number,
      physicalLocations: Schema.Number,
      configuredConsumers: Schema.Number,
      unverifiedExtensions: Schema.Number,
    }),
  ),
});

export type ExtensionInventory = typeof ExtensionInventorySchema.Type;

/** Whether desired state reaches rows with this lifecycle. */
export const isDesiredInventoryLifecycle = (lifecycle: ExtensionInventoryLifecycle): boolean =>
  lifecycle === "configured" || lifecycle === "implicit";

/** Aggregate counts for an inventory's already-filtered items. */
export const countExtensionInventory = (
  items: ReadonlyArray<ExtensionInventoryRow>,
): ExtensionInventory => {
  const withLifecycle = (lifecycle: ExtensionInventoryLifecycle): number =>
    items.filter((item) => item.classification.lifecycle === lifecycle).length;
  const nativeLocations = combineNativeLocationOutcomes(
    items.flatMap((item) => item.nativeLocations ?? []),
  );
  return {
    items,
    ...(items.some((item) => item.nativeLocations !== undefined)
      ? {
          nativeLocationCounts: {
            units: nativeLocations.length,
            unverifiedExtensions: items.filter(
              (item) => item.type !== "pack" && item.nativeLocations === undefined,
            ).length,
            physicalLocations: new Set(
              nativeLocations.map((unit) => JSON.stringify([unit.scope, unit.address.path])),
            ).size,
            configuredConsumers: new Set(
              nativeLocations.flatMap((unit) => unit.configuredConsumers),
            ).size,
          },
        }
      : {}),
    count: items.length,
    configuredCount: withLifecycle("configured"),
    implicitCount: withLifecycle("implicit"),
    installedCount: items.filter((item) => item.installed).length,
    leftoverCount: withLifecycle("leftover"),
    undeclaredCount: withLifecycle("undeclared"),
    unmanagedCount: withLifecycle("unmanaged"),
  };
};

export const projectExtensionInventory = (
  rows: ReadonlyArray<WorkspaceRecordRow>,
  overlay: {
    readonly outcomes: (row: WorkspaceRecordRow) => ReadonlyArray<ConfiguredAgentOutcome>;
    readonly nativeLocations?: (
      row: WorkspaceRecordRow,
    ) => ReadonlyArray<NativeLocationOutcome> | undefined;
    readonly agents?: ReadonlyArray<string>;
  },
): ExtensionInventory => {
  const filter = overlay.agents ?? [];
  return countExtensionInventory(
    rows
      .map((row) => {
        const nativeLocations = overlay.nativeLocations?.(row);
        const consumers = [
          ...new Set(nativeLocations?.flatMap((unit) => unit.configuredConsumers) ?? []),
        ];
        return {
          ...row,
          agentOutcomes: overlay.outcomes(row),
          ...(nativeLocations === undefined
            ? {}
            : {
                nativeLocations,
                duplicateDiscoveries: consumers.flatMap((agentId) => {
                  const units = nativeLocations.filter(
                    (unit) =>
                      unit.ownership !== "absent" && unit.configuredConsumers.includes(agentId),
                  );
                  return units.length < 2
                    ? []
                    : [{ agentId, nativeUnits: units.map(nativeUnitReference) }];
                }),
              }),
        };
      })
      .filter(
        (row) =>
          filter.length === 0 ||
          filter.some(
            (agent) =>
              row.agents.includes(agent) ||
              row.agentOutcomes.some((outcome) => outcome.agentId === agent),
          ),
      ),
  );
};
