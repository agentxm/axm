import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Argument, Command } from "effect/unstable/cli";

import { CliRenderer, type TableView } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { searchKnowledgeConcepts } from "@agentxm/client-core/unstable/knowledge";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { scopeConfig } from "./flags.js";
import { inspectInstalledKnowledge } from "./inspect.js";
import { ConceptSchema } from "./schemas.js";

export const KnowledgeSearchQueryResultSchema = Schema.Struct({
  query: Schema.String,
  items: Schema.Array(ConceptSchema),
  count: Schema.Number,
});

interface ConceptRow {
  readonly bundle: string;
  readonly id: string;
  readonly title: string;
  readonly type: string;
}

const ConceptTable = {
  columns: {
    bundle: { header: "Bundle" },
    id: { header: "Concept" },
    title: { header: "Title" },
    type: { header: "Type" },
  },
} as const satisfies TableView<ConceptRow>;

export const handleKnowledgeSearch = Effect.fn("Knowledge.search")(function* (query: string) {
  const renderer = yield* CliRenderer;
  const bundles = yield* inspectInstalledKnowledge();
  const concepts = bundles.flatMap(({ name, inspection }) =>
    searchKnowledgeConcepts(inspection.concepts, query).map((concept) => ({
      bundle: name,
      ...concept,
    })),
  );
  if (
    yield* renderer.result(
      { query, items: concepts, count: concepts.length },
      KnowledgeSearchQueryResultSchema,
    )
  )
    return;
  const rows = concepts.map((concept) => ({
    bundle: concept.bundle,
    id: concept.id,
    title: concept.title,
    type: concept.type ?? "—",
  }));
  if (rows.length === 0) {
    yield* renderer.info(`No knowledge concepts matched "${query}"`);
    return;
  }
  yield* renderer.table(
    rows,
    ConceptTable,
    `${rows.length} matching concept${rows.length === 1 ? "" : "s"}`,
  );
});

const searchConfig = {
  query: Argument.string("query").pipe(
    Argument.withDescription("Text to find across installed concepts"),
  ),
  ...scopeConfig,
} as const;

export const searchCommand = Command.make("search", searchConfig, ({ query, scope }) =>
  handleKnowledgeSearch(query).pipe(withWorkspace(scope), withRuntime("knowledge search")),
).pipe(
  withArgvTracking(searchConfig),
  Command.withDescription("Search installed knowledge concepts"),
  Command.withExamples([
    {
      command: 'axm knowledge search "authentication"',
      description: "Search concept metadata and content",
    },
  ]),
);
