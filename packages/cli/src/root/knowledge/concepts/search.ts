import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import { CliRenderer, type TableView } from "@agentxm/extension-management/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import {
  KnowledgeIndex,
  makeKnowledgeQuery,
  type KnowledgeQueryClause,
} from "@agentxm/extension-management/unstable/knowledge";
import { parseKnowledgeSearchQuery } from "@agentxm/registry-protocol/unstable/knowledge";
import type { WorkspaceScope } from "@agentxm/extension-management/unstable/workspace";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { scopeConfig } from "../flags.js";
import { captureInstalledKnowledgeIndex } from "../inspect.js";
import { KnowledgeConceptQueryPageSchema, type KnowledgeConceptQueryPage } from "./schemas.js";
import { sanitizeKnowledgeTerminalText } from "./terminal-text.js";
import { failKnowledgeCorpusChanging, failKnowledgeCursorExpired } from "./failures.js";

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

const queryClauses = (
  parsed: Extract<ReturnType<typeof parseKnowledgeSearchQuery>, { readonly ok: true }>,
): ReadonlyArray<KnowledgeQueryClause> =>
  parsed.query.clauses.map((clause) => {
    switch (clause.kind) {
      case "term":
        return { kind: "term", value: clause.token };
      case "phrase":
        return { kind: "phrase", value: clause.tokens.join(" ") };
      case "literal":
        return { kind: "literal", value: clause.value };
      default:
        return clause satisfies never;
    }
  });

export const handleKnowledgeConceptSearch = Effect.fn("Knowledge.concepts.search")(function* (
  queryText: string,
  scope: WorkspaceScope,
  options?: { readonly resultLimit?: number; readonly cursor?: string },
) {
  const parsed = parseKnowledgeSearchQuery(queryText);
  if (!parsed.ok) {
    return yield* makeAppError({ code: "validation", detail: parsed.detail });
  }
  if (
    options?.resultLimit !== undefined &&
    (options.resultLimit < 1 || options.resultLimit > 100)
  ) {
    return yield* makeAppError({
      code: "validation",
      detail: "Result limit must be between 1 and 100",
    });
  }

  const renderer = yield* CliRenderer;
  const index = yield* KnowledgeIndex;
  const captured = yield* renderer.withSpinner(
    "Searching installed knowledge",
    () => captureInstalledKnowledgeIndex(),
    { successMessage: "Searched installed knowledge" },
  );
  if (captured.outcome === "corpus-changing") return yield* failKnowledgeCorpusChanging();
  const { snapshot } = captured;
  const query = makeKnowledgeQuery(scope, queryClauses(parsed), {
    ...(options?.resultLimit === undefined ? {} : { resultLimit: options.resultLimit }),
    ...(options?.cursor === undefined ? {} : { cursor: options.cursor }),
  });
  const pageResult = yield* Effect.result(index.query(snapshot, query));
  if (!Result.isSuccess(pageResult)) return yield* failKnowledgeCursorExpired();
  const page = pageResult.success;
  const output: KnowledgeConceptQueryPage = {
    query,
    corpusFingerprint: snapshot.fingerprint,
    ...page,
  };
  if (yield* renderer.result(output, KnowledgeConceptQueryPageSchema)) return;

  const rows = page.items.map(({ ref, title, kind }) => ({
    bundle: sanitizeKnowledgeTerminalText(ref.bundle),
    concept: sanitizeKnowledgeTerminalText(ref.conceptId),
    title: sanitizeKnowledgeTerminalText(title ?? "—"),
    kind,
  }));
  if (rows.length === 0) {
    yield* renderer.info("No installed knowledge concepts matched");
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
