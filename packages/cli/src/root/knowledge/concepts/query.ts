import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { makeAppError } from "../../../app-error/index.js";
import { CliRenderer, type TableView } from "../../../cli-renderer/index.js";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import {
  KNOWLEDGE_LIFECYCLE_FILTER_FIELDS,
  KNOWLEDGE_METADATA_FILTER_FIELDS,
  KNOWLEDGE_SEARCHABLE_FIELDS,
  KnowledgeIndex,
  type KnowledgeQueryClause,
  makeKnowledgeQuery,
} from "@agentxm/knowledge-query";
import { parseKnowledgeSearchQuery } from "@agentxm/registry-protocol/unstable/knowledge";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";

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

const textClauses = (input: string): ReadonlyArray<KnowledgeQueryClause> | string => {
  const parsed = parseKnowledgeSearchQuery(input);
  if (!parsed.ok) return parsed.detail;
  return parsed.query.clauses.map((clause) => {
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
};

const splitAssignment = (input: string): readonly [string, string] | undefined => {
  const separator = input.indexOf("=");
  if (separator <= 0 || separator === input.length - 1) return undefined;
  return [input.slice(0, separator), input.slice(separator + 1)];
};

type FilterOperator = "equals" | "not-equals" | "contains";

const splitFilterAssignment = (
  input: string,
): readonly [string, FilterOperator, string] | undefined => {
  for (const [token, operator] of [
    ["!=", "not-equals"],
    ["~=", "contains"],
    ["=", "equals"],
  ] as const) {
    const separator = input.indexOf(token);
    if (separator <= 0 || separator + token.length === input.length) continue;
    return [input.slice(0, separator), operator, input.slice(separator + token.length)];
  }
  return undefined;
};

const fieldClauses = (
  inputs: ReadonlyArray<string>,
): ReadonlyArray<KnowledgeQueryClause> | string => {
  const clauses: KnowledgeQueryClause[] = [];
  for (const input of inputs) {
    const assignment = splitAssignment(input);
    if (assignment === undefined) return `Expected --field FIELD=QUERY, received "${input}"`;
    const [fieldName, query] = assignment;
    const field = KNOWLEDGE_SEARCHABLE_FIELDS.find((candidate) => candidate === fieldName);
    if (field === undefined) return `Unknown searchable field "${fieldName}"`;
    const parsed = textClauses(query);
    if (typeof parsed === "string") return parsed;
    for (const clause of parsed) {
      if (clause.kind !== "term" && clause.kind !== "phrase" && clause.kind !== "literal") {
        continue;
      }
      clauses.push({ kind: "field", field, clause });
    }
  }
  return clauses;
};

const propertyClauses = (
  inputs: ReadonlyArray<string>,
): ReadonlyArray<KnowledgeQueryClause> | string => {
  const clauses: KnowledgeQueryClause[] = [];
  for (const input of inputs) {
    const assignment = splitFilterAssignment(input);
    if (
      assignment === undefined ||
      !assignment[0].startsWith("/") ||
      /~(?:[^01]|$)/u.test(assignment[0])
    ) {
      return `Expected --property /json/pointer{=|!=|~=}VALUE, received "${input}"`;
    }
    clauses.push({
      kind: "property",
      pointer: assignment[0],
      operator: assignment[1],
      value: assignment[2],
    });
  }
  return clauses;
};

const metadataClauses = (
  inputs: ReadonlyArray<string>,
): ReadonlyArray<KnowledgeQueryClause> | string => {
  const clauses: KnowledgeQueryClause[] = [];
  for (const input of inputs) {
    const assignment = splitFilterAssignment(input);
    if (assignment === undefined) {
      return `Expected --metadata FIELD{=|!=|~=}VALUE, received "${input}"`;
    }
    const [fieldName, operator, value] = assignment;
    const field = KNOWLEDGE_METADATA_FILTER_FIELDS.find((candidate) => candidate === fieldName);
    if (field === undefined) return `Unknown metadata field "${fieldName}"`;
    clauses.push({ kind: "metadata", field, operator, value });
  }
  return clauses;
};

const lifecycleClauses = (
  inputs: ReadonlyArray<string>,
): ReadonlyArray<KnowledgeQueryClause> | string => {
  const clauses: KnowledgeQueryClause[] = [];
  for (const input of inputs) {
    const assignment = splitFilterAssignment(input);
    if (assignment === undefined) {
      return `Expected --lifecycle FIELD{=|!=}VALUE, received "${input}"`;
    }
    const [fieldName, operator, value] = assignment;
    const field = KNOWLEDGE_LIFECYCLE_FILTER_FIELDS.find((candidate) => candidate === fieldName);
    if (field === undefined) return `Unknown lifecycle field "${fieldName}"`;
    if (operator === "contains") return "Lifecycle filters do not support the contains operator";
    clauses.push({ kind: "lifecycle", field, operator, value });
  }
  return clauses;
};

interface QueryOptions {
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

const buildClauses = (options: QueryOptions): ReadonlyArray<KnowledgeQueryClause> | string => {
  const base = options.expression === undefined ? [] : textClauses(options.expression);
  if (typeof base === "string") return base;
  const fields = fieldClauses(options.fields);
  if (typeof fields === "string") return fields;
  const properties = propertyClauses(options.properties);
  if (typeof properties === "string") return properties;
  const metadata = metadataClauses(options.metadata);
  if (typeof metadata === "string") return metadata;
  const lifecycle = lifecycleClauses(options.lifecycle);
  if (typeof lifecycle === "string") return lifecycle;
  if (
    options.tags.some((value) => value.length === 0) ||
    options.bundle === "" ||
    options.status === ""
  ) {
    return "Filter values must not be empty";
  }
  return [
    ...base,
    ...fields,
    ...properties,
    ...metadata,
    ...lifecycle,
    ...options.tags.map((value): KnowledgeQueryClause => ({
      kind: "metadata",
      field: "tag",
      operator: "equals",
      value,
    })),
    ...(options.bundle === undefined
      ? []
      : [
          {
            kind: "metadata" as const,
            field: "bundle" as const,
            operator: "equals" as const,
            value: options.bundle,
          },
        ]),
    ...(options.kind === undefined
      ? []
      : [
          {
            kind: "metadata" as const,
            field: "kind" as const,
            operator: "equals" as const,
            value: options.kind,
          },
        ]),
    ...(options.status === undefined
      ? []
      : [
          {
            kind: "lifecycle" as const,
            field: "status" as const,
            operator: "equals" as const,
            value: options.status,
          },
        ]),
  ];
};

const validBound = (value: number | undefined, minimum: number, maximum: number): boolean =>
  value === undefined || (Number.isSafeInteger(value) && value >= minimum && value <= maximum);

export const handleKnowledgeConceptQuery = Effect.fn("Knowledge.concepts.query")(function* (
  scope: WorkspaceScope,
  options: QueryOptions,
) {
  const clauses = buildClauses(options);
  if (typeof clauses === "string") {
    return yield* makeAppError({ code: "validation", detail: clauses });
  }
  if (
    !validBound(options.resultLimit, 1, 100) ||
    !validBound(options.passageLimit, 0, 10) ||
    !validBound(options.passageLength, 1, 2_000)
  ) {
    return yield* makeAppError({
      code: "validation",
      detail:
        "Query bounds must keep --limit within 1-100, --passages within 0-10, and --passage-length within 1-2000",
    });
  }

  const renderer = yield* CliRenderer;
  const index = yield* KnowledgeIndex;
  const captured = yield* renderer.withSpinner(
    "Querying installed knowledge",
    () => captureInstalledKnowledgeIndex(),
    { successMessage: "Queried installed knowledge" },
  );
  if (captured.outcome === "corpus-changing") return yield* failKnowledgeCorpusChanging();
  const { snapshot } = captured;
  const query = makeKnowledgeQuery(scope, clauses, {
    ...(options.resultLimit === undefined ? {} : { resultLimit: options.resultLimit }),
    ...(options.passageLimit === undefined ? {} : { passageLimit: options.passageLimit }),
    ...(options.passageLength === undefined ? {} : { passageLength: options.passageLength }),
    ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
  });
  const pageResult = yield* Effect.result(index.query(snapshot, query));
  if (!Result.isSuccess(pageResult)) return yield* failKnowledgeCursorExpired();
  const page = pageResult.success;
  const output: KnowledgeConceptQueryPage = {
    query,
    corpusFingerprint: snapshot.fingerprint,
    ...page,
    ...(options.explain
      ? {
          explanation: {
            strategy: "lexical",
            ordering: query.ordering,
            rankFactors: [
              { field: "title", weight: 8 },
              { field: "conceptId", weight: 6 },
              { field: "tag", weight: 6 },
              { field: "description", weight: 4 },
              { field: "type", weight: 4 },
              { field: "body", weight: 2 },
              { field: "other", weight: 1 },
            ],
            tieBreak: "bundle FQN, then concept ID",
          },
        }
      : {}),
  };
  if (yield* renderer.result(output, KnowledgeConceptQueryPageSchema)) return;
  const rows = page.items.map(({ ref, title, matchedFields }) => ({
    bundle: sanitizeKnowledgeTerminalText(ref.bundle),
    concept: sanitizeKnowledgeTerminalText(ref.conceptId),
    title: sanitizeKnowledgeTerminalText(title ?? "—"),
    matched: matchedFields.join(", ") || "—",
  }));
  if (rows.length === 0) {
    yield* renderer.info("No installed knowledge concepts matched the query");
    return;
  }
  yield* renderer.table(
    rows,
    ConceptTable,
    `${rows.length} concept result${rows.length === 1 ? "" : "s"}`,
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
