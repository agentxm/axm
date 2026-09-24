import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import {
  KnowledgeConceptQueryPageSchema,
  KnowledgeDiscovery,
} from "@agentxm/workspace/knowledge/query";
import { observeUnit } from "@agentxm/workspace/transitions/planning";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";

import { ABSENT, emitResult, inventoryDoc, type ViewColumn } from "../../../screen/index.js";
import { processOutcome, withArgvTracking } from "../../../cli-runtime/index.js";
import {
  readOnlyCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import { withLiveOperation } from "../../../operation-lifecycle.js";
import { scopeConfig } from "../flags.js";
import { knowledgeCorpusFailures } from "../knowledge-errors.js";
import { failKnowledgeCorpusChanging, failKnowledgeCursorExpired } from "./failures.js";
import { sanitizeKnowledgeTerminalText } from "./terminal-text.js";

interface ConceptRow {
  readonly bundle: string;
  readonly concept: string;
  readonly title: string;
  readonly kind: string;
}

const conceptColumns: ReadonlyArray<ViewColumn<ConceptRow>> = [
  { header: "Bundle", value: (row) => row.bundle },
  { header: "Concept", value: (row) => row.concept },
  { header: "Title", value: (row) => row.title },
  { header: "Kind", value: (row) => row.kind },
];

export const handleKnowledgeConceptSearch = Effect.fn("Knowledge.concepts.search")(function* (
  queryText: string,
  scope: WorkspaceScope,
  options?: { readonly resultLimit?: number; readonly cursor?: string },
) {
  const result = yield* withLiveOperation(
    { command: "knowledge.concepts.search", name: "Search installed knowledge", mode: "preview" },
    observeUnit(
      { id: "index", label: "installed knowledge" },
      Effect.catchTags(
        KnowledgeDiscovery.search({
          scope,
          expression: queryText,
          ...(options?.resultLimit === undefined ? {} : { resultLimit: options.resultLimit }),
          ...(options?.cursor === undefined ? {} : { cursor: options.cursor }),
        }),
        knowledgeCorpusFailures,
      ),
    ),
  );
  if (result.outcome === "corpus-changing") return yield* failKnowledgeCorpusChanging();
  if (result.outcome === "cursor-expired") return yield* failKnowledgeCursorExpired();
  const page = result.page;
  yield* emitResult(page, KnowledgeConceptQueryPageSchema, () => {
    const rows = page.items.map(({ ref, title, kind }) => ({
      bundle: sanitizeKnowledgeTerminalText(ref.bundle),
      concept: sanitizeKnowledgeTerminalText(ref.conceptId),
      title: sanitizeKnowledgeTerminalText(title ?? ABSENT),
      kind,
    }));
    return inventoryDoc({
      rows,
      columns: conceptColumns,
      summary: `${rows.length} matching concept${rows.length === 1 ? "" : "s"}`,
      empty: "No installed knowledge concepts matched",
    });
  });
  return processOutcome(0);
});

const searchConfig = {
  query: Argument.String("query").pipe(
    Argument.withDescription(
      'All terms to find; use "phrase" for contiguous tokens or literal:"text" for exact punctuation',
    ),
  ),
  limit: Flag.Int("limit").pipe(
    Flag.withDescription("Maximum concepts to return (1-100; default 25)"),
    Flag.optional,
  ),
  cursor: Flag.String("cursor").pipe(
    Flag.withDescription("Continue from an opaque cursor returned by the previous page"),
    Flag.optional,
  ),
  ...scopeConfig,
} as const;

export const searchCommand = Command.make(
  "search",
  searchConfig,
  ({ query, limit, cursor, scope }) =>
    handleKnowledgeConceptSearch(query, scope, {
      ...Option.match(limit, {
        onNone: () => ({}),
        onSome: (resultLimit) => ({ resultLimit }),
      }),
      ...Option.match(cursor, {
        onNone: () => ({}),
        onSome: (value) => ({ cursor: value }),
      }),
    }).pipe(withWorkspace(scope), withRuntime("knowledge concepts search")),
).pipe(
  withArgvTracking(searchConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("Search installed knowledge concepts"),
  Command.withExamples([
    {
      command: 'axm knowledge concepts search "authentication"',
      description: "Match normalized terms across installed concept metadata and content",
    },
    {
      command: "axm knowledge concepts search '\"source of truth\"'",
      description: "Match a contiguous normalized phrase",
    },
  ]),
);
