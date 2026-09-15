/**
 * The published Knowledge discovery request grammar and its bounds.
 *
 * Callers hand over the filter expressions a person typed; this module decides
 * what they mean, refuses what the published contract does not admit, and
 * builds the canonical query. The grammar (`=`, `!=`, `~=`, JSON-pointer
 * properties, searchable field names) and every numeric bound live here, keyed
 * to the same capabilities document discovery publishes.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";

import { parseKnowledgeSearchQuery } from "@agentxm/extension-content/knowledge";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";

import { KNOWLEDGE_DISCOVERY_CAPABILITIES } from "../knowledge-capabilities.js";
import { KNOWLEDGE_RANK_FACTORS, KNOWLEDGE_RANK_TIE_BREAK } from "../knowledge-index.js";
import { KnowledgeRequestInvalid } from "../errors.js";
import {
  KNOWLEDGE_LIFECYCLE_FILTER_FIELDS,
  KNOWLEDGE_METADATA_FILTER_FIELDS,
  KNOWLEDGE_SEARCHABLE_FIELDS,
  makeKnowledgeQuery,
  type KnowledgeQuery,
  type KnowledgeQueryClause,
} from "../knowledge-query.js";

const limits = KNOWLEDGE_DISCOVERY_CAPABILITIES.limits;

/** The filter expressions one structured query request carries. */
export interface KnowledgeQueryRequest {
  readonly scope: WorkspaceScope;
  readonly expression?: string;
  readonly fields?: ReadonlyArray<string>;
  readonly properties?: ReadonlyArray<string>;
  readonly metadata?: ReadonlyArray<string>;
  readonly lifecycle?: ReadonlyArray<string>;
  readonly tags?: ReadonlyArray<string>;
  readonly bundle?: string;
  readonly kind?: "concept" | "index" | "log";
  readonly status?: string;
  readonly resultLimit?: number;
  readonly passageLimit?: number;
  readonly passageLength?: number;
  readonly cursor?: string;
}

/** A lexical search request: one text expression plus paging. */
export interface KnowledgeSearchRequest {
  readonly scope: WorkspaceScope;
  readonly expression: string;
  readonly resultLimit?: number;
  readonly cursor?: string;
}

/** The published explanation of how the lexical strategy ranked a page. */
export interface KnowledgeQueryExplanation {
  readonly strategy: "lexical";
  readonly ordering: "relevance" | "metadata";
  readonly rankFactors: ReadonlyArray<{ readonly field: string; readonly weight: number }>;
  readonly tieBreak: string;
}

/** Explain a query's ranking from the ranker's own weights. */
export const explainKnowledgeQuery = (query: KnowledgeQuery): KnowledgeQueryExplanation => ({
  strategy: "lexical",
  ordering: query.ordering,
  rankFactors: KNOWLEDGE_RANK_FACTORS,
  tieBreak: KNOWLEDGE_RANK_TIE_BREAK,
});

type FilterOperator = "equals" | "not-equals" | "contains";

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

const buildClauses = (
  request: KnowledgeQueryRequest,
): ReadonlyArray<KnowledgeQueryClause> | string => {
  const base = request.expression === undefined ? [] : textClauses(request.expression);
  if (typeof base === "string") return base;
  const fields = fieldClauses(request.fields ?? []);
  if (typeof fields === "string") return fields;
  const properties = propertyClauses(request.properties ?? []);
  if (typeof properties === "string") return properties;
  const metadata = metadataClauses(request.metadata ?? []);
  if (typeof metadata === "string") return metadata;
  const lifecycle = lifecycleClauses(request.lifecycle ?? []);
  if (typeof lifecycle === "string") return lifecycle;
  const tags = request.tags ?? [];
  if (tags.some((value) => value.length === 0) || request.bundle === "" || request.status === "") {
    return "Filter values must not be empty";
  }
  return [
    ...base,
    ...fields,
    ...properties,
    ...metadata,
    ...lifecycle,
    ...tags.map((value): KnowledgeQueryClause => ({
      kind: "metadata",
      field: "tag",
      operator: "equals",
      value,
    })),
    ...(request.bundle === undefined
      ? []
      : [
          {
            kind: "metadata" as const,
            field: "bundle" as const,
            operator: "equals" as const,
            value: request.bundle,
          },
        ]),
    ...(request.kind === undefined
      ? []
      : [
          {
            kind: "metadata" as const,
            field: "kind" as const,
            operator: "equals" as const,
            value: request.kind,
          },
        ]),
    ...(request.status === undefined
      ? []
      : [
          {
            kind: "lifecycle" as const,
            field: "status" as const,
            operator: "equals" as const,
            value: request.status,
          },
        ]),
  ];
};

const withinBound = (value: number | undefined, minimum: number, maximum: number): boolean =>
  value === undefined || (Number.isSafeInteger(value) && value >= minimum && value <= maximum);

const paging = (request: {
  readonly resultLimit?: number;
  readonly passageLimit?: number;
  readonly passageLength?: number;
  readonly cursor?: string;
}) => ({
  ...(request.resultLimit === undefined ? {} : { resultLimit: request.resultLimit }),
  ...(request.passageLimit === undefined ? {} : { passageLimit: request.passageLimit }),
  ...(request.passageLength === undefined ? {} : { passageLength: request.passageLength }),
  ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
});

/**
 * Refuse a request whose paging bounds fall outside what discovery publishes.
 * Whole numbers only: a fractional bound is not a page size discovery can honour.
 */
const checkPagingBounds = (request: {
  readonly resultLimit?: number;
  readonly passageLimit?: number;
  readonly passageLength?: number;
}): string | undefined =>
  withinBound(request.resultLimit, 1, limits.maximumPageSize) &&
  withinBound(request.passageLimit, 0, limits.maximumPassagesPerResult) &&
  withinBound(request.passageLength, 1, limits.maximumPassageLength)
    ? undefined
    : `Query bounds must keep --limit within 1-${limits.maximumPageSize}, --passages within 0-${limits.maximumPassagesPerResult}, and --passage-length within 1-${limits.maximumPassageLength}`;

/** Build the canonical query one structured request denotes. */
export const makeKnowledgeQueryRequest = (
  request: KnowledgeQueryRequest,
): Effect.Effect<KnowledgeQuery, KnowledgeRequestInvalid> => {
  const clauses = buildClauses(request);
  if (typeof clauses === "string") {
    return Effect.fail(new KnowledgeRequestInvalid({ detail: clauses }));
  }
  const bounds = checkPagingBounds(request);
  if (bounds !== undefined) return Effect.fail(new KnowledgeRequestInvalid({ detail: bounds }));
  return Effect.succeed(makeKnowledgeQuery(request.scope, clauses, paging(request)));
};

/** Build the canonical query one lexical search request denotes. */
export const makeKnowledgeSearchRequest = (
  request: KnowledgeSearchRequest,
): Effect.Effect<KnowledgeQuery, KnowledgeRequestInvalid> => {
  const clauses = textClauses(request.expression);
  if (typeof clauses === "string") {
    return Effect.fail(new KnowledgeRequestInvalid({ detail: clauses }));
  }
  const bounds = checkPagingBounds(request);
  if (bounds !== undefined) return Effect.fail(new KnowledgeRequestInvalid({ detail: bounds }));
  return Effect.succeed(makeKnowledgeQuery(request.scope, clauses, paging(request)));
};

/** Refuse a traversal depth outside the published maximum. */
export const checkTraversalDepth = (
  depth: number,
): Effect.Effect<number, KnowledgeRequestInvalid> =>
  Number.isSafeInteger(depth) && depth >= 1 && depth <= limits.maximumTraversalDepth
    ? Effect.succeed(depth)
    : Effect.fail(
        new KnowledgeRequestInvalid({
          detail: `Depth must be between 1 and ${limits.maximumTraversalDepth}`,
        }),
      );
