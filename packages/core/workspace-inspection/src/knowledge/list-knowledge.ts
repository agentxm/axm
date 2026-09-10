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
} from "@agentxm/workspace-projection";
import {
  configuredAgentLifecycleOutcomes,
  ConfiguredAgentOutcomeSchema,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
  type ConfiguredAgentOutcome,
} from "@agentxm/workspace-state";

import { WorkspaceInspectionFailed } from "../errors.js";

const BundleSchema = Schema.Struct({
  name: Schema.String,
  sourceRoot: Schema.String,
  concepts: Schema.Number,
  diagnostics: Schema.Number,
  instructionEntry: Schema.optionalKey(
    Schema.Struct({
      included: Schema.Boolean,
      reason: Schema.Literals([
        "bundle-disabled",
        "instruction-files-disabled",
        "knowledge-instructions-disabled",
        "workspace-excluded",
        "manifest-excluded",
        "included",
      ]),
    }),
  ),
  agentOutcomes: Schema.Array(ConfiguredAgentOutcomeSchema),
});

export const KnowledgeListQueryResultSchema = Schema.Struct({
  items: Schema.Array(BundleSchema),
  count: Schema.Number,
});
export type KnowledgeListQueryResult = typeof KnowledgeListQueryResultSchema.Type;

export interface KnowledgeListRow {
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
  query: Effect.fn("ListKnowledge.query")(function* () {
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
      { concurrency: "unbounded" },
    );

    const inventory = yield* records.getExtensionInventory("knowledge", {});
    const configuredAgents = yield* settings.configuredAgents;
    const configured = yield* settings.entries("knowledge");
    const discoveryConfig = yield* settings.knowledgeDiscoveryConfig;
    const instructionFiles = yield* settings.instructionsConfig;
    const instructionFilesEnabled =
      Option.isSome(instructionFiles) && instructionFiles.value !== false;

    const bundlesByName = new Map(bundles.map((bundle) => [bundle.name, bundle]));
    const inventoryNames = new Set(inventory.items.map((item) => item.name));

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
                knowledgeInstructionsEnabled: discoveryConfig.instructions,
                ...(workspaceInstructionEntry === undefined ? {} : { workspaceInstructionEntry }),
                ...(bundle?.manifest.instructionEntry === undefined
                  ? {}
                  : { manifestInstructionEntry: bundle.manifest.instructionEntry }),
              })
            : undefined;
        return {
          name: item.name,
          sourceRoot: bundle?.sourceRoot ?? item.paths[0] ?? "n/a",
          concepts: bundle?.inspection.concepts.length ?? 0,
          diagnostics: bundle?.inspection.diagnostics.length ?? 0,
          ...(instructionEntry === undefined ? {} : { instructionEntry }),
          agentOutcomes: item.agentOutcomes,
        };
      }),
      ...bundles
        .filter(({ name }) => !inventoryNames.has(name))
        .map(({ name, sourceRoot, manifest, inspection }): KnowledgeListRow => ({
          name,
          sourceRoot,
          concepts: inspection.concepts.length,
          diagnostics: inspection.diagnostics.length,
          instructionEntry: resolveKnowledgeInstructionEntry({
            bundleEnabled: true,
            instructionFilesEnabled,
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

    return { document: { items: rows, count: rows.length }, rows };
  }),
};
