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
  readonly matched: string;
}

const ConceptTable = {
  columns: {
    bundle: { header: "Bundle" },
    concept: { header: "Concept" },
    title: { header: "Title" },
    matched: { header: "Matched" },
  },
} as const satisfies TableView<ConceptRow>;

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
  readonly explain: boolean;
}

export const handleKnowledgeConceptQuery = Effect.fn("Knowledge.concepts.query")(function* (
  scope: WorkspaceScope,
  args: KnowledgeConceptQueryArgs,
) {
  const screen = yield* Screen;
  const result = yield* withLiveOperation(
    { command: "knowledge.concepts.query", name: "Query installed knowledge", mode: "preview" },
    observeUnit(
      { id: "index", label: "installed knowledge" },
      Effect.catchTags(KnowledgeDiscovery.query({ scope, ...args }), knowledgeCorpusFailures),
    ),
  );
  if (result.outcome === "corpus-changing") return yield* failKnowledgeCorpusChanging();
  if (result.outcome === "cursor-expired") return yield* failKnowledgeCursorExpired();
  const page = result.page;
  if (yield* screen.document(page, KnowledgeConceptQueryPageSchema)) return;
  const rows = page.items.map(({ ref, title, matchedFields }) => ({
    bundle: sanitizeKnowledgeTerminalText(ref.bundle),
    concept: sanitizeKnowledgeTerminalText(ref.conceptId),
    title: sanitizeKnowledgeTerminalText(title ?? "—"),
    matched: matchedFields.join(", ") || "—",
  }));
  if (rows.length === 0) {
    yield* screen.note(headlineDoc("info", "No installed knowledge concepts matched the query"));
    return;
  }
  yield* screen.result(
    tableViewDoc(
      rows,
      ConceptTable,
      `${rows.length} concept result${rows.length === 1 ? "" : "s"}`,
    ),
  );
});

const optionalString = (name: string, description: string) =>
  Flag.string(name).pipe(Flag.withDescription(description), Flag.optional);
const repeatedString = (name: string, description: string) =>
  Flag.string(name).pipe(Flag.withDescription(description), Flag.atLeast(0));
const optionalInteger = (name: string, description: string) =>
  Flag.integer(name).pipe(Flag.withDescription(description), Flag.optional);

const queryConfig = {
  expression: Argument.string("expression").pipe(
    Argument.withDescription("Optional text expression using terms, phrases, and literals"),
    Argument.optional,
  ),
  field: repeatedString("field", "Search one field with FIELD=QUERY; repeatable"),
  property: repeatedString(
    "property",
    "Filter frontmatter with /pointer{=|!=|~=}VALUE; repeatable",
  ),
  metadata: repeatedString(
    "metadata",
    "Filter typed metadata with FIELD{=|!=|~=}VALUE; repeatable",
  ),
  lifecycle: repeatedString(
    "lifecycle",
    "Filter lifecycle evidence with FIELD{=|!=}VALUE; repeatable",
  ),
  tag: repeatedString("tag", "Require an exact tag; repeatable"),
  bundle: optionalString("bundle", "Require an exact Knowledge bundle FQN"),
  kind: Flag.choice("kind", ["concept", "index", "log"] as const).pipe(
    Flag.withDescription("Select ordinary, index, or log documents"),
    Flag.optional,
  ),
  status: optionalString("status", "Require an exact lifecycle status"),
  limit: optionalInteger("limit", "Maximum concepts to return (1-100; default 25)"),
  passages: optionalInteger("passages", "Maximum evidence passages per result (0-10)"),
  passageLength: optionalInteger(
    "passage-length",
    "Maximum characters per evidence passage (1-2000)",
  ),
  cursor: optionalString("cursor", "Continue from a previous opaque cursor"),
  explain: Flag.boolean("explain").pipe(
    Flag.withDescription("Include deterministic ranking rules in machine output"),
    Flag.withDefault(false),
  ),
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
    explain,
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
      explain,
    }).pipe(withWorkspace(scope), withRuntime("knowledge concepts query")),
).pipe(
  withArgvTracking(queryConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("Run a structured query over installed knowledge concepts"),
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
