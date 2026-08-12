import * as Schema from "effect/Schema";
import { WORKSPACE_SCOPES } from "../workspace/scope.js";
import type { KnowledgeSearchableField } from "./knowledge-projection.js";

export const KNOWLEDGE_QUERY_CONTRACT_VERSION = "axm-knowledge-query-v1";

export const KNOWLEDGE_DISCOVERY_OPERATIONS = [
  "resolve",
  "search",
  "query",
  "get",
  "related",
  "status",
] as const;

export const KNOWLEDGE_QUERY_OPERATORS = [
  "term",
  "phrase",
  "literal",
  "equals",
  "not-equals",
  "contains",
] as const;

export const KNOWLEDGE_SEARCHABLE_FIELDS = [
  "bundle",
  "conceptId",
  "title",
  "description",
  "tag",
  "type",
  "body",
  "resource",
  "status",
  "staleAfter",
  "generated",
  "verified",
  "trust",
] as const satisfies ReadonlyArray<KnowledgeSearchableField>;

export const KNOWLEDGE_METADATA_FILTER_FIELDS = [
  "bundle",
  "conceptId",
  "kind",
  "title",
  "description",
  "tag",
  "type",
  "resource",
] as const;

export const KNOWLEDGE_LIFECYCLE_FILTER_FIELDS = [
  "status",
  "staleAfter",
  "generated",
  "verified",
  "trust",
] as const;

const nonEmptyValue = Schema.NonEmptyString.annotate({
  description: "A non-empty decoded query value.",
});

export const KnowledgeTextClauseSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("term"), value: nonEmptyValue }),
  Schema.Struct({ kind: Schema.Literal("phrase"), value: nonEmptyValue }),
  Schema.Struct({ kind: Schema.Literal("literal"), value: nonEmptyValue }),
]).annotate({ identifier: "KnowledgeTextClause" });
export type KnowledgeTextClause = typeof KnowledgeTextClauseSchema.Type;

export const KnowledgeQueryClauseSchema = Schema.Union([
  KnowledgeTextClauseSchema,
  Schema.Struct({
    kind: Schema.Literal("field"),
    field: Schema.Literals(KNOWLEDGE_SEARCHABLE_FIELDS),
    clause: KnowledgeTextClauseSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("metadata"),
    field: Schema.Literals(KNOWLEDGE_METADATA_FILTER_FIELDS),
    operator: Schema.Literals(["equals", "not-equals", "contains"]),
    value: nonEmptyValue,
  }),
  Schema.Struct({
    kind: Schema.Literal("lifecycle"),
    field: Schema.Literals(KNOWLEDGE_LIFECYCLE_FILTER_FIELDS),
    operator: Schema.Literals(["equals", "not-equals"]),
    value: nonEmptyValue,
  }),
  Schema.Struct({
    kind: Schema.Literal("property"),
    pointer: Schema.NonEmptyString.check(
      Schema.makeFilter((value) =>
        value.startsWith("/") ? undefined : "Expected an RFC 6901 JSON Pointer",
      ),
    ),
    operator: Schema.Literals(["equals", "not-equals", "contains"]),
    value: nonEmptyValue,
  }),
]).annotate({ identifier: "KnowledgeQueryClause" });
export type KnowledgeQueryClause = typeof KnowledgeQueryClauseSchema.Type;

export const KnowledgeQuerySchema = Schema.Struct({
  version: Schema.Literal(KNOWLEDGE_QUERY_CONTRACT_VERSION),
  scope: Schema.Literals(WORKSPACE_SCOPES),
  clauses: Schema.Array(KnowledgeQueryClauseSchema),
  ordering: Schema.Literals(["relevance", "metadata"]),
  resultLimit: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 100 })),
  passageLimit: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 10 })),
  passageLength: Schema.Number.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: 1, maximum: 2_000 }),
  ),
  cursor: Schema.optional(Schema.NonEmptyString),
}).annotate({
  identifier: "KnowledgeQuery",
  title: "Knowledge Query",
  description: "Canonical, serializable Knowledge discovery query model.",
});

export type KnowledgeQuery = typeof KnowledgeQuerySchema.Type;

export const makeKnowledgeQuery = (
  scope: (typeof WORKSPACE_SCOPES)[number],
  clauses: ReadonlyArray<KnowledgeQueryClause>,
  options?: {
    readonly ordering?: "relevance" | "metadata";
    readonly resultLimit?: number;
    readonly passageLimit?: number;
    readonly passageLength?: number;
    readonly cursor?: string;
  },
): KnowledgeQuery => ({
  version: KNOWLEDGE_QUERY_CONTRACT_VERSION,
  scope,
  clauses,
  ordering: options?.ordering ?? (clauses.length === 0 ? "metadata" : "relevance"),
  resultLimit: options?.resultLimit ?? 25,
  passageLimit: options?.passageLimit ?? 3,
  passageLength: options?.passageLength ?? 500,
  ...(options?.cursor === undefined ? {} : { cursor: options.cursor }),
});

/** The cursor and bounds do not change which candidates a canonical query denotes. */
export const knowledgeQueryIdentity = (query: KnowledgeQuery): unknown => ({
  version: query.version,
  scope: query.scope,
  clauses: query.clauses,
  ordering: query.ordering,
});
