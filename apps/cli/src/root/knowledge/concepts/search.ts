import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { KnowledgeConceptQueryPageSchema, KnowledgeDiscovery } from "@agentxm/knowledge-query";
import { observeUnit } from "@agentxm/workspace-operations";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";

import { Screen, headlineDoc, tableViewDoc, type TableView } from "../../../screen/index.js";
import { withArgvTracking } from "../../../cli-runtime/index.js";
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

const ConceptTable = {
  columns: {
    bundle: { header: "Bundle" },
    concept: { header: "Concept" },
    title: { header: "Title" },
    kind: { header: "Kind" },
  },
} as const satisfies TableView<ConceptRow>;

export const handleKnowledgeConceptSearch = Effect.fn("Knowledge.concepts.search")(function* (
  queryText: string,
  scope: WorkspaceScope,
  options?: { readonly resultLimit?: number; readonly cursor?: string },
) {
  const screen = yield* Screen;
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
  if (yield* screen.document(page, KnowledgeConceptQueryPageSchema)) return;

  const rows = page.items.map(({ ref, title, kind }) => ({
    bundle: sanitizeKnowledgeTerminalText(ref.bundle),
    concept: sanitizeKnowledgeTerminalText(ref.conceptId),
    title: sanitizeKnowledgeTerminalText(title ?? "—"),
    kind,
  }));
  if (rows.length === 0) {
    yield* screen.note(headlineDoc("info", "No installed knowledge concepts matched"));
    return;
  }
  yield* screen.result(
    tableViewDoc(
      rows,
      ConceptTable,
      `${rows.length} matching concept${rows.length === 1 ? "" : "s"}`,
    ),
  );
});

const searchConfig = {
  query: Argument.string("query").pipe(
    Argument.withDescription(
      'All terms to find; use "phrase" for contiguous tokens or literal:"text" for exact punctuation',
    ),
  ),
  limit: Flag.integer("limit").pipe(
    Flag.withDescription("Maximum concepts to return (1-100; default 25)"),
    Flag.optional,
  ),
  cursor: Flag.string("cursor").pipe(
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
