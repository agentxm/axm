/**
 * The typed outcome documents Knowledge discovery reports.
 *
 * These are the feature's contract with automation: every discovery operation
 * decodes its result through the schema declared here, and the application
 * only wraps them in its envelope.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SchemaParser from "effect/SchemaParser";
import * as SchemaTransformation from "effect/SchemaTransformation";

import {
  ConceptRefSchema,
  KnowledgeRevisionSchema,
  ResolvedConceptRefSchema,
} from "@agentxm/extension-model/unstable/knowledge";

import { KnowledgeDiscoveryCapabilitiesSchema } from "./knowledge-capabilities.js";
import { KnowledgeQuerySchema } from "./knowledge-query.js";

const FrontmatterWireSchema = Schema.Record(Schema.String, Schema.Json);

/** Preserve the core source mapping while validating JSON compatibility on encoding. */
export const FrontmatterDocumentSchema = FrontmatterWireSchema.pipe(
  Schema.decodeTo(
    Schema.toType(Schema.Record(Schema.String, Schema.Unknown)),
    SchemaTransformation.transformOrFail<Readonly<Record<string, unknown>>, Schema.JsonObject>({
      decode: (frontmatter) => Effect.succeed(frontmatter),
      encode: (frontmatter) => SchemaParser.decodeUnknownEffect(FrontmatterWireSchema)(frontmatter),
    }),
  ),
);

const KnowledgeActorSchema = Schema.Struct({
  by: Schema.String,
  at: Schema.optional(Schema.String),
});

const KnowledgeMatchSpanSchema = Schema.Struct({
  clauseIndex: Schema.Number,
  field: Schema.String,
  start: Schema.Number,
  end: Schema.Number,
});

const KnowledgePassageSchema = Schema.Struct({
  text: Schema.String,
  section: Schema.Array(Schema.String),
  startLine: Schema.Number,
  endLine: Schema.Number,
  spans: Schema.Array(KnowledgeMatchSpanSchema),
});

export const KnowledgeConceptResultSchema = Schema.Struct({
  ref: ResolvedConceptRefSchema,
  orderingKey: Schema.String,
  matchedFields: Schema.Array(Schema.String),
  passages: Schema.Array(KnowledgePassageSchema),
  kind: Schema.Literals(["concept", "index", "log"]),
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  staleAfter: Schema.optional(Schema.String),
  generated: Schema.optional(KnowledgeActorSchema),
  verified: Schema.optional(Schema.Array(KnowledgeActorSchema)),
  trust: Schema.optional(Schema.Literals(["unverified", "machine-confirmed", "human-reviewed"])),
  relativePath: Schema.String,
});

export const KnowledgeConceptQueryPageSchema = Schema.Struct({
  query: KnowledgeQuerySchema,
  corpusFingerprint: KnowledgeRevisionSchema,
  items: Schema.Array(KnowledgeConceptResultSchema),
  count: Schema.Number,
  hasMore: Schema.Boolean,
  cursor: Schema.optional(Schema.String),
  explanation: Schema.optional(
    Schema.Struct({
      strategy: Schema.Literal("lexical"),
      ordering: Schema.Literals(["relevance", "metadata"]),
      rankFactors: Schema.Array(Schema.Struct({ field: Schema.String, weight: Schema.Number })),
      tieBreak: Schema.String,
    }),
  ),
});
export type KnowledgeConceptQueryPage = typeof KnowledgeConceptQueryPageSchema.Type;

const KnowledgeConceptDocumentSchema = Schema.Struct({
  ref: ResolvedConceptRefSchema,
  projectionRevision: KnowledgeRevisionSchema,
  kind: Schema.Literals(["concept", "index", "log"]),
  title: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  tags: Schema.optional(Schema.Array(Schema.String)),
  resource: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  staleAfter: Schema.optional(Schema.String),
  generated: Schema.optional(KnowledgeActorSchema),
  verified: Schema.optional(Schema.Array(KnowledgeActorSchema)),
  trust: Schema.optional(Schema.Literals(["unverified", "machine-confirmed", "human-reviewed"])),
  frontmatter: Schema.optional(FrontmatterDocumentSchema),
  relativePath: Schema.String,
  body: Schema.String,
  raw: Schema.optional(Schema.String),
});

export const KnowledgeConceptGetOutputSchema = Schema.Struct({
  outcome: Schema.Literals(["found", "failed"]),
  concept: Schema.optional(KnowledgeConceptDocumentSchema),
  reason: Schema.optional(Schema.Literal("revision-changed")),
  ref: Schema.optional(ResolvedConceptRefSchema),
  expectedRevision: Schema.optional(KnowledgeRevisionSchema),
  currentRevision: Schema.optional(KnowledgeRevisionSchema),
});
export type KnowledgeConceptGetOutput = typeof KnowledgeConceptGetOutputSchema.Type;

const KnowledgeResolveCandidateSchema = Schema.Struct({
  ref: ResolvedConceptRefSchema,
  title: Schema.optional(Schema.String),
  reason: Schema.Literals(["exact-reference", "exact-concept-id", "exact-title", "token-match"]),
  score: Schema.Number,
  orderingKey: Schema.String,
});

export const KnowledgeConceptResolveOutputSchema = Schema.Struct({
  outcome: Schema.Literals(["resolved", "ambiguous", "not-found"]),
  reason: Schema.optional(Schema.Literal("ambiguous-reference")),
  candidate: Schema.optional(KnowledgeResolveCandidateSchema),
  candidates: Schema.optional(Schema.Array(KnowledgeResolveCandidateSchema)),
});
export type KnowledgeConceptResolveOutput = typeof KnowledgeConceptResolveOutputSchema.Type;

const KnowledgeRelatedConceptSchema = Schema.Struct({
  ref: ResolvedConceptRefSchema,
  title: Schema.optional(Schema.String),
  relation: Schema.Literals(["outgoing", "backlink"]),
  depth: Schema.Number,
  via: ConceptRefSchema,
  evidence: Schema.Struct({
    source: ConceptRefSchema,
    sourceRelativePath: Schema.String,
    line: Schema.Number,
  }),
  orderingKey: Schema.String,
});

export const KnowledgeConceptRelatedOutputSchema = Schema.Struct({
  ref: ResolvedConceptRefSchema,
  maximumDepth: Schema.Number,
  includesIndexBacklinks: Schema.Boolean,
  items: Schema.Array(KnowledgeRelatedConceptSchema),
  count: Schema.Number,
  corpusFingerprint: KnowledgeRevisionSchema,
});
export type KnowledgeConceptRelatedOutput = typeof KnowledgeConceptRelatedOutputSchema.Type;

export const KnowledgeConceptStatusOutputSchema = Schema.Struct({
  capabilities: KnowledgeDiscoveryCapabilitiesSchema,
  readiness: Schema.Literals(["ready", "changing", "unavailable"]),
  health: Schema.Struct({
    status: Schema.Literals(["healthy", "unhealthy"]),
    diagnostics: Schema.Array(Schema.String),
  }),
  corpusFingerprint: Schema.optional(KnowledgeRevisionSchema),
  bundleCount: Schema.Number,
  conceptCount: Schema.Number,
  scopeCollisions: Schema.Struct({
    checkedScope: Schema.Literals(["project", "user"]),
    state: Schema.Literals(["determined", "not-determined"]),
    bundleNames: Schema.Array(Schema.String),
  }),
});
export type KnowledgeConceptStatusOutput = typeof KnowledgeConceptStatusOutputSchema.Type;

const KnowledgeLintDiagnosticSchema = Schema.Struct({
  bundle: Schema.String,
  code: Schema.String,
  severity: Schema.String,
  relativePath: Schema.String,
  line: Schema.optional(Schema.Number),
  column: Schema.optional(Schema.Number),
  message: Schema.String,
  details: Schema.optional(
    Schema.Struct({ kind: Schema.Literal("frontmatter-parse"), reason: Schema.String }),
  ),
});

export const KnowledgeLintQueryResultSchema = Schema.Struct({
  valid: Schema.Boolean,
  diagnostics: Schema.Array(KnowledgeLintDiagnosticSchema),
});
export type KnowledgeLintQueryResult = typeof KnowledgeLintQueryResultSchema.Type;

export const KnowledgeConceptCursorFailureSchema = Schema.Struct({
  outcome: Schema.Literal("failed"),
  reason: Schema.Literal("cursor-expired"),
});

export const KnowledgeConceptCorpusChangingFailureSchema = Schema.Struct({
  outcome: Schema.Literal("failed"),
  reason: Schema.Literal("corpus-changing"),
});
