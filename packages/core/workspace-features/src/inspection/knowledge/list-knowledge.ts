import { withInspectionReadView } from "../read-view.js";
// @effect-diagnostics anyUnknownInErrorContext:off — bundle inspection relays caller-owned opaque OKF accessor failures as one typed inspection failure
/**
 * The installed Knowledge inventory behind `axm knowledge list`.
 *
 * A bundle can be present in the physical inventory, in the workspace's
 * selection, or in both, and the answer is their union ordered by name. Each
 * row reports what the bundle contains, and — for every bundle the selection
 * reaches — whether its concepts enter the agents' instruction files and why.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { inspectKnowledgePackage } from "@agentxm/extension-content/knowledge";
import {
  InstalledKnowledgeUnavailable,
  resolveKnowledgeInstructionEntry,
  selectInstalledKnowledgeBundles,
  type KnowledgeInstructionEntryResolution,
} from "@agentxm/workspace-kernel/projection";
import {
  configuredAgentLifecycleOutcomes,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
} from "@agentxm/workspace-kernel/workspace-state";
import { type ConfiguredAgentOutcome } from "@agentxm/workspace-kernel/operations";

import {
  buildInventoryDocument,
  ExtensionListItemSchema,
  ExtensionInventoryDocumentFields,
  inventoryEnvelope,
  type ExtensionListItem,
} from "../inventory-document.js";
import { WorkspaceInspectionFailed } from "../errors.js";

const BundleSchema = Schema.Struct({
  ...ExtensionListItemSchema.fields,
  sourceRoot: Schema.String,
  concepts: Schema.Number,
  diagnostics: Schema.Number,
  instructionEntry: Schema.optionalKey(
    Schema.Struct({
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
    }),
  ),
});

export const KnowledgeListQueryResultSchema = Schema.Struct({
  ...ExtensionInventoryDocumentFields,
  items: Schema.Array(BundleSchema),
});
export type KnowledgeListQueryResult = typeof KnowledgeListQueryResultSchema.Type;

export interface KnowledgeListRow {
  readonly management: ExtensionListItem["management"];
  readonly name: string;
  readonly sourceRoot: string;
  readonly concepts: number;
  readonly diagnostics: number;
  readonly instructionEntry?: KnowledgeInstructionEntryResolution;
  readonly agentOutcomes: ReadonlyArray<ConfiguredAgentOutcome>;
}

const inspectionFailed = (name: string, cause: unknown) =>
  new WorkspaceInspectionFailed({
    category: "validation",
    detail: `Failed to inspect knowledge bundle "${name}"`,
    cause,
  });

export const ListKnowledge = {
  query: Effect.fn("ListKnowledge.query")(function* (request: {
    readonly agents?: ReadonlyArray<string>;
  }) {
    const location = yield* WorkspaceLocation;
    const records = yield* WorkspaceRecords;
    const settings = yield* SettingsReader;

    const selected = yield* selectInstalledKnowledgeBundles().pipe(
      Effect.catchTag("InstalledKnowledgeUnavailable", (failure: InstalledKnowledgeUnavailable) =>
        Effect.fail(
          new WorkspaceInspectionFailed({ category: "validation", detail: failure.detail }),
        ),
      ),
    );
    const bundles = yield* Effect.forEach(
      selected,
      (entry) =>
        inspectKnowledgePackage(entry.packageRoot).pipe(
          Effect.map((inspected) => ({
            ...inspected,
            name: entry.name,
            sourceRoot: entry.sourceRoot,
          })),
          Effect.mapError((cause) => inspectionFailed(entry.name, cause)),
        ),
      { concurrency: 16 },
    );

    const agentFilter = request.agents ?? [];
    const fullInventory = yield* records.getExtensionInventory("knowledge", {});
    const inventory =
      agentFilter.length === 0
        ? fullInventory
        : yield* records.getExtensionInventory("knowledge", { agents: agentFilter });
    const configuredAgents = yield* settings.configuredAgents;
    const configured = yield* settings.entries("knowledge");
    const discoveryConfig = yield* settings.knowledgeDiscoveryConfig;
    const instructionFiles = yield* settings.instructionsConfig;
    const instructionFilesEnabled =
      Option.isSome(instructionFiles) && instructionFiles.value !== false;
    const instructionFilesUndecided = Option.isNone(instructionFiles);

    const bundlesByName = new Map(bundles.map((bundle) => [bundle.name, bundle]));
    const inventoryNames = new Set(fullInventory.items.map((item) => item.name));

    const rows: ReadonlyArray<KnowledgeListRow> = [
      ...inventory.items.map((item): KnowledgeListRow => {
        const bundle = bundlesByName.get(item.name);
        const workspaceInstructionEntry = configured[item.name]?.instructionEntry;
        // A bundle the selection did not reach and that is not disabled has no
        // instruction-entry decision to report.
        const instructionEntry =
          item.enabled === false || bundle !== undefined
            ? resolveKnowledgeInstructionEntry({
                bundleEnabled: item.enabled !== false,
                instructionFilesEnabled,
                instructionFilesUndecided,
                knowledgeInstructionsEnabled: discoveryConfig.instructions,
                ...(workspaceInstructionEntry === undefined ? {} : { workspaceInstructionEntry }),
                ...(bundle?.manifest.instructionEntry === undefined
                  ? {}
                  : { manifestInstructionEntry: bundle.manifest.instructionEntry }),
              })
            : undefined;
        return {
          name: item.name,
          management: item.classification.lifecycle,
          sourceRoot: bundle?.sourceRoot ?? item.paths[0] ?? "n/a",
          concepts: bundle?.inspection.concepts.length ?? 0,
          diagnostics: bundle?.inspection.diagnostics.length ?? 0,
          ...(instructionEntry === undefined ? {} : { instructionEntry }),
          agentOutcomes: item.agentOutcomes,
        };
      }),
      ...bundles
        .filter(
          ({ name }) =>
            !inventoryNames.has(name) &&
            (agentFilter.length === 0 ||
              agentFilter.some((agent) => configuredAgents.includes(agent))),
        )
        .map(({ name, sourceRoot, manifest, inspection }): KnowledgeListRow => ({
          name,
          management: "configured",
          sourceRoot,
          concepts: inspection.concepts.length,
          diagnostics: inspection.diagnostics.length,
          instructionEntry: resolveKnowledgeInstructionEntry({
            bundleEnabled: true,
            instructionFilesEnabled,
            instructionFilesUndecided,
            knowledgeInstructionsEnabled: discoveryConfig.instructions,
            ...(manifest.instructionEntry === undefined
              ? {}
              : { manifestInstructionEntry: manifest.instructionEntry }),
          }),
          agentOutcomes: configuredAgentLifecycleOutcomes({
            type: "knowledge",
            name,
            agentIds: configuredAgents,
            scope: location.scope,
            state: "current",
            targetState: "enabled",
            installed: true,
          }),
        })),
    ].sort((left, right) => left.name.localeCompare(right.name));

    const core = yield* buildInventoryDocument(inventory);
    const items = rows.map((row) => {
      const observed = core.items.find((item) => item.name === row.name);
      const bundle = bundlesByName.get(row.name);
      const fallback: ExtensionListItem = {
        type: "knowledge",
        name: row.name,
        scope: location.scope,
        ...(bundle === undefined
          ? {}
          : {
              fqn: `${bundle.manifest.owner}/knowledge/${bundle.manifest.name}`,
              version: bundle.manifest.version,
            }),
        management: row.management,
        installed: true,
        enabled: true,
        source: { kind: "unknown", locator: row.sourceRoot },
        agentOutcomes: row.agentOutcomes,
      };
      return { ...(observed ?? fallback), ...row };
    });
    return { document: inventoryEnvelope(items, rows.length), rows } satisfies {
      readonly document: KnowledgeListQueryResult;
      readonly rows: ReadonlyArray<KnowledgeListRow>;
    };
  }, withInspectionReadView),
};
