import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Command } from "effect/unstable/cli";

import { Screen, count, inventoryDoc, type ViewColumn } from "../../screen/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import {
  ConfiguredAgentOutcomeSchema,
  configuredAgentLifecycleOutcomes,
  WorkspaceMutations,
} from "@agentxm/workspace-state";
import {
  resolveKnowledgeInstructionEntry,
  type KnowledgeInstructionEntryResolution,
} from "@agentxm/extension-workspace";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { scopeConfig } from "./flags.js";
import { inspectInstalledKnowledge } from "./inspect.js";
import { inventoryAgentOutcomes } from "../inventory-view.js";

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

interface BundleRow {
  readonly name: string;
  readonly concepts: number;
  readonly diagnostics: number;
  readonly sourceRoot: string;
  readonly instructionEntry?: KnowledgeInstructionEntryResolution;
  readonly agentOutcomes: ReadonlyArray<typeof ConfiguredAgentOutcomeSchema.Type>;
}

const renderInstructionEntry = (
  resolution: KnowledgeInstructionEntryResolution | undefined,
): string =>
  resolution === undefined
    ? "n/a"
    : `${resolution.included ? "included" : "excluded"} (${resolution.reason})`;

const BundleColumns = [
  { header: "Bundle", priority: "required", value: (row: BundleRow) => row.name },
  { header: "Concepts", align: "right", value: (row: BundleRow) => String(row.concepts) },
  { header: "Diagnostics", align: "right", value: (row: BundleRow) => String(row.diagnostics) },
  { header: "Source", priority: "optional", value: (row: BundleRow) => row.sourceRoot },
  {
    header: "Instruction entry",
    priority: "optional",
    value: (row: BundleRow) => renderInstructionEntry(row.instructionEntry),
  },
  {
    header: "Agent outcomes",
    priority: "optional",
    value: (row: BundleRow) => inventoryAgentOutcomes(row.agentOutcomes),
  },
] satisfies ReadonlyArray<ViewColumn<BundleRow>>;

export const handleKnowledgeList = Effect.fn("Knowledge.list")(function* () {
  const screen = yield* Screen;
  const ws = yield* WorkspaceMutations;
  const bundles = yield* inspectInstalledKnowledge();
  const inventory = yield* ws.records.getExtensionInventory("knowledge", {});
  const configuredAgents = yield* ws.getConfiguredAgents();
  const configured = yield* ws.getConfiguredKnowledgeEntries();
  const discoveryConfig = yield* ws.getKnowledgeDiscoveryConfig();
  const instructionFiles = yield* ws.getInstructionsConfig();
  const instructionFilesEnabled =
    Option.isSome(instructionFiles) && instructionFiles.value !== false;
  const bundlesByName = new Map(bundles.map((bundle) => [bundle.name, bundle]));
  const inventoryNames = new Set(inventory.items.map((item) => item.name));
  const rows = [
    ...inventory.items.map((item) => {
      const bundle = bundlesByName.get(item.name);
      const workspaceInstructionEntry = configured[item.name]?.instructionEntry;
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
      .map(({ name, sourceRoot, manifest, inspection }) => ({
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
          scope: ws.scope,
          state: "current",
          targetState: "enabled",
          installed: true,
        }),
      })),
  ].sort((left, right) => left.name.localeCompare(right.name));
  if (yield* screen.document({ items: rows, count: rows.length }, KnowledgeListQueryResultSchema))
    return;
  yield* screen.result(
    inventoryDoc({
      rows,
      columns: BundleColumns,
      summary: count(rows.length, "knowledge bundle"),
      empty: "No knowledge bundles installed",
    }),
  );
});

export const listCommand = Command.make("list", scopeConfig, ({ scope }) =>
  handleKnowledgeList().pipe(
    withWorkspace({ scope, allowUninitialized: true }),
    withRuntime("knowledge list"),
  ),
).pipe(
  withArgvTracking(scopeConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("List installed knowledge bundles"),
  Command.withExamples([
    { command: "axm knowledge list", description: "List installed knowledge bundles" },
  ]),
);
