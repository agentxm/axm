import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command } from "effect/unstable/cli";

import {
  CliRenderer,
  registerEntity,
  type TableView,
} from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { scopeConfig } from "./flags.js";
import { inspectInstalledKnowledge } from "./inspect.js";

const BundleSchema = Schema.Struct({
  name: Schema.String,
  sourceRoot: Schema.String,
  concepts: Schema.Number,
  diagnostics: Schema.Number,
});

export const KnowledgeListQueryResultSchema = Schema.Struct({
  items: Schema.Array(BundleSchema),
  count: Schema.Number,
});

interface BundleRow {
  readonly name: string;
  readonly concepts: number;
  readonly diagnostics: number;
  readonly sourceRoot: string;
}

const BundleTable = {
  columns: {
    name: { header: "Bundle" },
    concepts: { header: "Concepts" },
    diagnostics: { header: "Diagnostics" },
    sourceRoot: { header: "Source" },
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
  const bundles = yield* inspectInstalledKnowledge();
  const rows = bundles.map(({ name, sourceRoot, inspection }) => ({
    name,
    sourceRoot,
    concepts: inspection.concepts.length,
    diagnostics: inspection.diagnostics.length,
  }));
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
