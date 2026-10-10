import {
  withParameterDefault,
  withParameterDescription,
  withParameterRange,
} from "../../../cli-parameters.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/cli";

import {
  KnowledgeConceptQueryPageSchema,
  KnowledgeDiscovery,
} from "@agentxm/workspace-features/knowledge-query";
import { observeUnit } from "@agentxm/workspace-kernel/operations";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";

import { LearnMore, formatLearnMore } from "../../../formatter.js";
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
  readonly matched: string;
}

const conceptColumns: ReadonlyArray<ViewColumn<ConceptRow>> = [
  { header: "Bundle", value: (row) => row.bundle },
  { header: "Concept", value: (row) => row.concept },
  { header: "Title", value: (row) => row.title },
  { header: "Matched", value: (row) => row.matched },
];

export interface KnowledgeConceptQueryArgs {
  readonly expression?: string;
  readonly fields: ReadonlyArray<string>;
  readonly properties: ReadonlyArray<string>;
  readonly metadata: ReadonlyArray<string>;
  readonly lifecycle: ReadonlyArray<string>;
  readonly tags: ReadonlyArray<string>;
  readonly bundle?: string;
  readonly kind?: "concept" | "index" | "log";
  readonly status?: string;
  readonly resultLimit?: number;
  readonly passageLimit?: number;
  readonly passageLength?: number;
  readonly cursor?: string;
}

export const handleKnowledgeConceptQuery = Effect.fn("Knowledge.concepts.query")(function* (
  scope: WorkspaceScope,
  args: KnowledgeConceptQueryArgs,
) {
  const result = yield* withLiveOperation(
    { command: "knowledge.concepts.query", name: "Query installed knowledge", mode: "query" },
    observeUnit(
      { id: "index", label: "installed knowledge" },
      Effect.catchTags(KnowledgeDiscovery.query({ scope, ...args }), knowledgeCorpusFailures),
    ),
  );
  if (result.outcome === "corpus-changing") return yield* failKnowledgeCorpusChanging();
  if (result.outcome === "cursor-expired") return yield* failKnowledgeCursorExpired();
  const page = result.page;
  yield* emitResult(page, KnowledgeConceptQueryPageSchema, () => {
    const rows = page.items.map(({ ref, title, matchedFields }) => ({
      bundle: sanitizeKnowledgeTerminalText(ref.bundle),
      concept: sanitizeKnowledgeTerminalText(ref.conceptId),
      title: sanitizeKnowledgeTerminalText(title ?? ABSENT),
      matched: matchedFields.join(", ") || ABSENT,
    }));
    return inventoryDoc({
      rows,
      columns: conceptColumns,
      summary: `${rows.length} concept result${rows.length === 1 ? "" : "s"}`,
      empty: "No installed knowledge concepts matched the query",
    });
  });
  return processOutcome(0);
});

const optionalString = (name: string, description: string) =>
  Flag.String(name).pipe(withParameterDescription(description), Flag.optional);
const repeatedString = (name: string, description: string) =>
  Flag.String(name).pipe(withParameterDescription(description), Flag.atLeast(0));
const boundedInteger = (
  name: string,
  description: string,
  min: number,
  max: number,
  defaultValue: number,
) =>
  Flag.Int(name).pipe(
    withParameterDescription(description),
    withParameterRange(min, max),
    withParameterDefault(defaultValue),
    Flag.map(Option.some),
  );

const queryConfig = {
  expression: Argument.String("expression").pipe(
    withParameterDescription(
      'Terms to find; "phrase" for contiguous tokens, literal:"text" for exact punctuation',
    ),
    Argument.optional,
  ),
  field: repeatedString("field", "Search FIELD=EXPRESSION; FIELDs: see axm help knowledge"),
  property: repeatedString("property", "Filter RFC 6901 JSON Pointer with /pointer{=|!=|~=}VALUE"),
  metadata: repeatedString(
    "metadata",
    "FIELD{=|!=|~=}VALUE; FIELD: bundle,conceptId,kind,title,description,tag,type,resource",
  ),
  lifecycle: repeatedString(
    "lifecycle",
    "FIELD{=|!=}VALUE; FIELD: status,staleAfter,generated,verified,trust",
  ),
  tag: repeatedString("tag", "Require an exact tag, as --metadata tag=TAG"),
  bundle: optionalString(
    "bundle",
    "Require an exact Knowledge bundle FQN, as --metadata bundle=FQN",
  ),
  kind: Flag.Literals("kind", ["concept", "index", "log"] as const).pipe(
    withParameterDescription(
      "Document kind, as --metadata kind=KIND; unset returns concept documents only",
    ),
    Flag.optional,
  ),
  status: optionalString(
    "status",
    "Lifecycle status, as --lifecycle status=STATUS; unset excludes deprecated",
  ),
  limit: boundedInteger("limit", "Maximum concepts to return", 1, 100, 25),
  passages: boundedInteger(
    "passages",
    "Maximum evidence passages per result in machine output",
    0,
    10,
    3,
  ),
  passageLength: boundedInteger(
    "passage-length",
    "Maximum characters per evidence passage",
    1,
    2000,
    500,
  ),
  cursor: optionalString("cursor", "Continue from the cursor returned by the previous page"),
  ...scopeConfig,
} as const;

export const queryCommand = Command.make(
  "query",
  queryConfig,
  ({
    expression,
    field,
    property,
    metadata,
    lifecycle,
    tag,
    bundle,
    kind,
    status,
    limit,
    passages,
    passageLength,
    cursor,
    scope,
  }) =>
    handleKnowledgeConceptQuery(scope, {
      ...Option.match(expression, {
        onNone: () => ({}),
        onSome: (value) => ({ expression: value }),
      }),
      fields: field,
      properties: property,
      metadata,
      lifecycle,
      tags: tag,
      ...Option.match(bundle, {
        onNone: () => ({}),
        onSome: (value) => ({ bundle: value }),
      }),
      ...Option.match(kind, {
        onNone: () => ({}),
        onSome: (value) => ({ kind: value }),
      }),
      ...Option.match(status, {
        onNone: () => ({}),
        onSome: (value) => ({ status: value }),
      }),
      ...Option.match(limit, {
        onNone: () => ({}),
        onSome: (value) => ({ resultLimit: value }),
      }),
      ...Option.match(passages, {
        onNone: () => ({}),
        onSome: (value) => ({ passageLimit: value }),
      }),
      ...Option.match(passageLength, {
        onNone: () => ({}),
        onSome: (value) => ({ passageLength: value }),
      }),
      ...Option.match(cursor, {
        onNone: () => ({}),
        onSome: (value) => ({ cursor: value }),
      }),
    }).pipe(withWorkspace(scope), withRuntime("knowledge concepts query")),
).pipe(
  withArgvTracking(queryConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("Query installed knowledge concepts"),
  Command.annotate(
    LearnMore,
    formatLearnMore([["axm help knowledge", "Read query syntax and supported fields"]]),
  ),
  Command.withExamples([
    {
      command: "axm knowledge concepts query authentication --tag source-of-truth --status stable",
      description: "Combine text, metadata, and lifecycle clauses",
    },
    {
      command:
        "axm knowledge concepts query --field title=authentication --property /audience=agents",
      description: "Search a field and filter preserved frontmatter",
    },
  ]),
);
