import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command } from "effect/unstable/cli";

import {
  CliRenderer,
  registerEntity,
  type TableView,
} from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { ConfiguredAgentOutcomeSchema } from "@agentxm/client-core/unstable/plan";
import {
  configuredAgentLifecycleOutcomes,
  WorkspaceMutations,
} from "@agentxm/client-core/unstable/workspace";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { scopeConfig } from "./flags.js";
import { inspectInstalledKnowledge } from "./inspect.js";
import { inventoryAgentOutcomes } from "../extension-inventory.js";

const BundleSchema = Schema.Struct({
  name: Schema.String,
  sourceRoot: Schema.String,
  concepts: Schema.Number,
  diagnostics: Schema.Number,
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
  readonly agentOutcomes: ReadonlyArray<typeof ConfiguredAgentOutcomeSchema.Type>;
}

const BundleTable = {
  columns: {
    name: { header: "Bundle" },
    concepts: { header: "Concepts" },
    diagnostics: { header: "Diagnostics" },
    sourceRoot: { header: "Source" },
    agentOutcomes: { header: "Agent outcomes", render: inventoryAgentOutcomes },
  },
} as const satisfies TableView<BundleRow>;

// Keyed by the catalog type id, per parity obligation 8.6, so the table and
// JSON views of `knowledge list` render from one column definition.
registerEntity<BundleRow>("knowledge", {
  list: {
    columns: BundleTable.columns,
    emptyMessage: "No knowledge bundles installed",
    singularLabel: "knowledge bundle",
    pluralLabel: "knowledge bundles",
  },
});

export const handleKnowledgeList = Effect.fn("Knowledge.list")(function* () {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const bundles = yield* inspectInstalledKnowledge();
  const inventory = yield* ws.records.getExtensionInventory("knowledge", {});
  const configuredAgents = yield* ws.getConfiguredAgents();
  const bundlesByName = new Map(bundles.map((bundle) => [bundle.name, bundle]));
  const inventoryNames = new Set(inventory.items.map((item) => item.name));
  const rows = [
    ...inventory.items.map((item) => {
      const bundle = bundlesByName.get(item.name);
      return {
        name: item.name,
        sourceRoot: bundle?.sourceRoot ?? item.paths[0] ?? "n/a",
        concepts: bundle?.inspection.concepts.length ?? 0,
        diagnostics: bundle?.inspection.diagnostics.length ?? 0,
        agentOutcomes: item.agentOutcomes,
      };
    }),
    ...bundles
      .filter(({ name }) => !inventoryNames.has(name))
      .map(({ name, sourceRoot, inspection }) => ({
        name,
        sourceRoot,
        concepts: inspection.concepts.length,
        diagnostics: inspection.diagnostics.length,
        agentOutcomes: configuredAgentLifecycleOutcomes({
          type: "knowledge",
          name,
          agentIds: configuredAgents,
          scope: ws.scope,
          state: "current",
          enabled: true,
          installed: true,
        }),
      })),
  ].sort((left, right) => left.name.localeCompare(right.name));
  if (yield* renderer.result({ items: rows, count: rows.length }, KnowledgeListQueryResultSchema))
    return;
  yield* renderer.list("knowledge", { items: rows, count: rows.length });
});

export const listCommand = Command.make("list", scopeConfig, ({ scope }) =>
  handleKnowledgeList().pipe(
    withWorkspace({ scope, allowUninitialized: true }),
    withRuntime("knowledge list"),
  ),
).pipe(
  withArgvTracking(scopeConfig),
  Command.withAlias("ls"),
  Command.withDescription("List installed knowledge bundles"),
  Command.withExamples([
    { command: "axm knowledge list", description: "List installed knowledge bundles" },
  ]),
);
