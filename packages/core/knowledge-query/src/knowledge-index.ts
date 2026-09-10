import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import * as Result from "effect/Result";
import * as ServiceMap from "effect/Context";
import { createHash } from "node:crypto";
import {
  type KnowledgeBundleFqn,
  type KnowledgeRevision,
  type ResolvedConceptRef,
} from "@agentxm/extension-model/unstable/knowledge/concept-ref";
import { resolveKnowledgeFrontmatterPointer } from "./knowledge-projection.js";
import {
  projectKnowledgeConcepts,
  type KnowledgeBodyPassage,
  type KnowledgeProjectedConcept,
  type KnowledgeSearchableField,
  type KnowledgeSearchableUnit,
} from "./knowledge-projection.js";
import {
  knowledgeQueryIdentity,
  type KnowledgeQuery,
  type KnowledgeQueryClause,
  type KnowledgeTextClause,
} from "./knowledge-query.js";
import {
  computeKnowledgeCorpusFingerprint,
  computeKnowledgeProjectionRevision,
  type CapturedKnowledgeSource,
} from "./knowledge-revision.js";
import { tokenizeKnowledgeSearchText } from "@agentxm/registry-protocol/unstable/knowledge/knowledge-search";
import type {
  KnowledgeConcept,
  KnowledgeInspection,
} from "@agentxm/registry-protocol/unstable/knowledge/okf";

export interface KnowledgeIndexBundleInput {
  readonly bundle: KnowledgeBundleFqn;
  readonly version: string;
  readonly inspection: KnowledgeInspection;
  readonly sources: ReadonlyArray<CapturedKnowledgeSource>;
}

export interface KnowledgeIndexedConcept {
  readonly ref: ResolvedConceptRef;
  readonly projectionRevision: KnowledgeRevision;
  readonly projected: KnowledgeProjectedConcept;
  readonly source: KnowledgeConcept;
  readonly sourceBytes: Uint8Array;
}

export interface KnowledgeIndexSnapshot {
  readonly fingerprint: KnowledgeRevision;
  readonly concepts: ReadonlyArray<KnowledgeIndexedConcept>;
}

export interface KnowledgeMatchSpan {
  readonly clauseIndex: number;
  readonly field: KnowledgeSearchableField;
  readonly start: number;
  readonly end: number;
}

export interface KnowledgeResultPassage extends KnowledgeBodyPassage {
  readonly spans: ReadonlyArray<KnowledgeMatchSpan>;
}

export interface KnowledgeConceptResult {
  readonly ref: ResolvedConceptRef;
  readonly orderingKey: string;
  readonly matchedFields: ReadonlyArray<KnowledgeSearchableField>;
  readonly passages: ReadonlyArray<KnowledgeResultPassage>;
  readonly kind: KnowledgeProjectedConcept["kind"];
  readonly title?: string;
  readonly description?: string;
  readonly status?: string;
  readonly staleAfter?: string;
  readonly generated?: KnowledgeProjectedConcept["generated"];
  readonly verified?: KnowledgeProjectedConcept["verified"];
  readonly trust?: KnowledgeProjectedConcept["trust"];
  readonly relativePath: string;
}

export interface KnowledgeQueryPage {
  readonly items: ReadonlyArray<KnowledgeConceptResult>;
  readonly count: number;
  readonly hasMore: boolean;
  readonly cursor?: string;
}

export type KnowledgeCursorInvalidReason =
  "invalid" | "expired" | "corpus-changed" | "query-changed";

export class KnowledgeCursorInvalidError extends Data.TaggedError("KnowledgeCursorInvalidError")<{
  readonly reason: KnowledgeCursorInvalidReason;
}> {}

const CURSOR_VERSION = "axm-knowledge-cursor-v1";
const CURSOR_MAX_AGE_MS = 86_400_000;

interface KnowledgeCursorPayload {
  readonly version: typeof CURSOR_VERSION;
  readonly corpusFingerprint: string;
  readonly queryDigest: string;
  readonly offset: number;
  readonly issuedAt: number;
}

const queryDigest = (query: KnowledgeQuery): string =>
  createHash("sha256")
    .update(JSON.stringify(knowledgeQueryIdentity(query)))
    .digest("hex");

const encodeCursor = (payload: KnowledgeCursorPayload): string =>
  Buffer.from(JSON.stringify(payload)).toString("base64url");

const isCursorPayload = (value: unknown): value is KnowledgeCursorPayload => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return (
    "version" in value &&
    value.version === CURSOR_VERSION &&
    "corpusFingerprint" in value &&
    typeof value.corpusFingerprint === "string" &&
    "queryDigest" in value &&
    typeof value.queryDigest === "string" &&
    "offset" in value &&
    typeof value.offset === "number" &&
    Number.isSafeInteger(value.offset) &&
    value.offset >= 0 &&
    "issuedAt" in value &&
    typeof value.issuedAt === "number" &&
    Number.isSafeInteger(value.issuedAt)
  );
};

const decodeCursor = (
  cursor: string,
  snapshot: KnowledgeIndexSnapshot,
  query: KnowledgeQuery,
  now: number,
): Result.Result<KnowledgeCursorPayload, KnowledgeCursorInvalidError> => {
  let decoded: unknown;
  try {
    if (!/^[A-Za-z0-9_-]+$/u.test(cursor)) {
      return Result.fail(new KnowledgeCursorInvalidError({ reason: "invalid" }));
    }
    decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    return Result.fail(new KnowledgeCursorInvalidError({ reason: "invalid" }));
  }
  if (!isCursorPayload(decoded)) {
    return Result.fail(new KnowledgeCursorInvalidError({ reason: "invalid" }));
  }
  if (decoded.issuedAt > now || now - decoded.issuedAt > CURSOR_MAX_AGE_MS) {
    return Result.fail(new KnowledgeCursorInvalidError({ reason: "expired" }));
  }
  if (decoded.corpusFingerprint !== snapshot.fingerprint) {
    return Result.fail(new KnowledgeCursorInvalidError({ reason: "corpus-changed" }));
  }
  if (decoded.queryDigest !== queryDigest(query)) {
    return Result.fail(new KnowledgeCursorInvalidError({ reason: "query-changed" }));
  }
  return Result.succeed(decoded);
};

const sourceForConcept = (
  bundle: KnowledgeIndexBundleInput,
  concept: KnowledgeConcept,
): CapturedKnowledgeSource | undefined =>
  bundle.sources.find((source) => source.relativePath === concept.relativePath);

export const makeKnowledgeIndexSnapshot = (
  bundles: ReadonlyArray<KnowledgeIndexBundleInput>,
): KnowledgeIndexSnapshot => {
  const sources = bundles.flatMap(({ sources }) => sources);
  const concepts: KnowledgeIndexedConcept[] = [];
  for (const bundle of [...bundles].sort((left, right) =>
    left.bundle.localeCompare(right.bundle),
  )) {
    const bundleFingerprint = computeKnowledgeCorpusFingerprint(bundle.sources);
    const projected = projectKnowledgeConcepts(bundle.bundle, bundle.inspection.concepts);
    for (const [index, source] of bundle.inspection.concepts.entries()) {
      const projection = projected[index];
      const captured = sourceForConcept(bundle, source);
      if (projection === undefined || captured === undefined) continue;
      concepts.push({
        ref: {
          bundle: bundle.bundle,
          conceptId: source.id,
          bundleVersion: bundle.version,
          bundleFingerprint,
          contentRevision: captured.sourceRevision,
        },
        projectionRevision: computeKnowledgeProjectionRevision(projection),
        projected: projection,
        source,
        sourceBytes: captured.bytes,
      });
    }
  }
  return {
    fingerprint: computeKnowledgeCorpusFingerprint(sources),
    concepts: concepts.sort(
      (left, right) =>
        left.ref.bundle.localeCompare(right.ref.bundle) ||
        left.ref.conceptId.localeCompare(right.ref.conceptId),
    ),
  };
};

const normalizedLiteral = (value: string): string =>
  value.normalize("NFKC").toUpperCase().toLowerCase();

const containsPhrase = (
  fieldTokens: ReadonlyArray<string>,
  phraseTokens: ReadonlyArray<string>,
): boolean => {
  if (phraseTokens.length > fieldTokens.length) return false;
  for (let start = 0; start <= fieldTokens.length - phraseTokens.length; start += 1) {
    if (phraseTokens.every((token, offset) => fieldTokens[start + offset] === token)) return true;
  }
  return false;
};

const textMatches = (text: string, clause: KnowledgeTextClause): boolean => {
  switch (clause.kind) {
    case "term":
      return tokenizeKnowledgeSearchText(text).includes(
        tokenizeKnowledgeSearchText(clause.value)[0] ?? "",
      );
    case "phrase":
      return containsPhrase(
        tokenizeKnowledgeSearchText(text),
        tokenizeKnowledgeSearchText(clause.value),
      );
    case "literal":
      return normalizedLiteral(text).includes(normalizedLiteral(clause.value));
    default:
      return clause satisfies never;
  }
};

const valueMatches = (
  candidate: string,
  operator: "equals" | "not-equals" | "contains",
  expected: string,
): boolean => {
  const left = normalizedLiteral(candidate);
  const right = normalizedLiteral(expected);
  if (operator === "equals") return left === right;
  if (operator === "not-equals") return left !== right;
  return left.includes(right);
};

const stringValues = (value: unknown): ReadonlyArray<string> => {
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  return [];
};

const metadataValues = (
  concept: KnowledgeProjectedConcept,
  field: Extract<KnowledgeQueryClause, { readonly kind: "metadata" }>["field"],
): ReadonlyArray<string> => {
  switch (field) {
    case "bundle":
      return [concept.bundle];
    case "conceptId":
      return [concept.conceptId];
    case "kind":
      return [concept.kind];
    case "title":
      return concept.title === undefined ? [] : [concept.title];
    case "description":
      return concept.description === undefined ? [] : [concept.description];
    case "tag":
      return concept.tags ?? [];
    case "type":
      return concept.type === undefined ? [] : [concept.type];
    case "resource":
      return concept.resource === undefined ? [] : [concept.resource];
    default:
      return field satisfies never;
  }
};

const lifecycleValues = (
  concept: KnowledgeProjectedConcept,
  field: Extract<KnowledgeQueryClause, { readonly kind: "lifecycle" }>["field"],
): ReadonlyArray<string> => {
  switch (field) {
    case "status":
      return concept.status === undefined ? [] : [concept.status];
    case "staleAfter":
      return concept.staleAfter === undefined ? [] : [concept.staleAfter];
    case "generated":
      return concept.generated === undefined ? [] : [concept.generated.by];
    case "verified":
      return concept.verified?.map(({ by }) => by) ?? [];
    case "trust":
      return concept.trust === undefined ? [] : [concept.trust];
    default:
      return field satisfies never;
  }
};

const collectionMatches = (
  values: ReadonlyArray<string>,
  operator: "equals" | "not-equals" | "contains",
  expected: string,
): boolean =>
  operator === "not-equals"
    ? values.every((value) => valueMatches(value, operator, expected))
    : values.some((value) => valueMatches(value, operator, expected));

const matchingUnits = (
  concept: KnowledgeProjectedConcept,
  clause: KnowledgeQueryClause,
): ReadonlyArray<KnowledgeSearchableUnit> => {
  if (clause.kind === "term" || clause.kind === "phrase" || clause.kind === "literal") {
    return concept.searchableUnits.filter((unit) => textMatches(unit.text, clause));
  }
  if (clause.kind === "field") {
    return concept.searchableUnits.filter(
      (unit) => unit.field === clause.field && textMatches(unit.text, clause.clause),
    );
  }
  return [];
};

const clauseMatches = (
  concept: KnowledgeProjectedConcept,
  clause: KnowledgeQueryClause,
): boolean => {
  switch (clause.kind) {
    case "term":
    case "phrase":
    case "literal":
    case "field":
      return matchingUnits(concept, clause).length > 0;
    case "metadata":
      return collectionMatches(
        metadataValues(concept, clause.field),
        clause.operator,
        clause.value,
      );
    case "lifecycle":
      return collectionMatches(
        lifecycleValues(concept, clause.field),
        clause.operator,
        clause.value,
      );
    case "property": {
      const resolved = resolveKnowledgeFrontmatterPointer(concept.frontmatter, clause.pointer);
      return (
        resolved.found &&
        collectionMatches(stringValues(resolved.value), clause.operator, clause.value)
      );
    }
    default:
      return clause satisfies never;
  }
};

const hasExplicitFilter = (
  query: KnowledgeQuery,
  kind: "metadata" | "lifecycle",
  field: string,
): boolean => query.clauses.some((clause) => clause.kind === kind && clause.field === field);

const fieldWeight = (field: KnowledgeSearchableField): number => {
  switch (field) {
    case "title":
      return 8;
    case "conceptId":
    case "tag":
      return 6;
    case "description":
    case "type":
      return 4;
    case "body":
      return 2;
    default:
      return 1;
  }
};

interface LocatedToken {
  readonly start: number;
  readonly end: number;
}

const locateTokenSequence = (
  text: string,
  tokens: ReadonlyArray<string>,
): LocatedToken | undefined => {
  if (tokens.length === 0) return undefined;
  const normalized = normalizedLiteral(text);

  const visit = (
    tokenIndex: number,
    searchStart: number,
    firstStart?: number,
  ): LocatedToken | undefined => {
    const token = tokens[tokenIndex];
    if (token === undefined) {
      return firstStart === undefined ? undefined : { start: firstStart, end: searchStart };
    }
    const needle = normalizedLiteral(token);
    let start = normalized.indexOf(needle, searchStart);
    while (start >= 0) {
      const between = text.slice(searchStart, start);
      if (tokenIndex === 0 || tokenizeKnowledgeSearchText(between).length === 0) {
        const end = start + needle.length;
        const found = visit(tokenIndex + 1, end, firstStart ?? start);
        if (found !== undefined) return found;
      }
      start = normalized.indexOf(needle, start + 1);
    }
    return undefined;
  };

  return visit(0, 0);
};

const exactSpan = (
  text: string,
  clause: KnowledgeTextClause,
  clauseIndex: number,
  field: KnowledgeSearchableField,
): KnowledgeMatchSpan | undefined => {
  if (clause.kind === "literal") {
    const needle = normalizedLiteral(clause.value);
    const start = normalizedLiteral(text).indexOf(needle);
    if (start < 0) return undefined;
    return { clauseIndex, field, start, end: Math.min(text.length, start + needle.length) };
  }
  const located = locateTokenSequence(text, tokenizeKnowledgeSearchText(clause.value));
  return located === undefined ? undefined : { clauseIndex, field, ...located };
};

interface RankedConcept {
  readonly concept: KnowledgeIndexedConcept;
  readonly score: number;
  readonly matchedFields: ReadonlyArray<KnowledgeSearchableField>;
  readonly passages: ReadonlyArray<KnowledgeResultPassage>;
}

const rankConcept = (
  concept: KnowledgeIndexedConcept,
  query: KnowledgeQuery,
): RankedConcept | undefined => {
  if (!hasExplicitFilter(query, "metadata", "kind") && concept.projected.kind !== "concept") {
    return undefined;
  }
  if (
    !hasExplicitFilter(query, "lifecycle", "status") &&
    normalizedLiteral(concept.projected.status ?? "") === "deprecated"
  ) {
    return undefined;
  }
  if (!query.clauses.every((clause) => clauseMatches(concept.projected, clause))) return undefined;

  const fields = new Set<KnowledgeSearchableField>();
  const passageSpans = new Map<number, KnowledgeMatchSpan[]>();
  let score = 0;
  for (const [clauseIndex, clause] of query.clauses.entries()) {
    const units = matchingUnits(concept.projected, clause);
    const clauseFields = new Set(units.map(({ field }) => field));
    for (const field of clauseFields) score += fieldWeight(field);
    for (const unit of units) {
      fields.add(unit.field);
      if (unit.passageIndex === undefined) continue;
      const textClause = clause.kind === "field" ? clause.clause : clause;
      if (
        textClause.kind !== "term" &&
        textClause.kind !== "phrase" &&
        textClause.kind !== "literal"
      ) {
        continue;
      }
      const span = exactSpan(unit.text, textClause, clauseIndex, unit.field);
      if (span === undefined) continue;
      const spans = passageSpans.get(unit.passageIndex) ?? [];
      spans.push(span);
      passageSpans.set(unit.passageIndex, spans);
    }
  }
  const passages = [...passageSpans]
    .sort(([left], [right]) => left - right)
    .slice(0, query.passageLimit)
    .flatMap(([passageIndex, spans]) => {
      const passage = concept.projected.bodyPassages[passageIndex];
      if (passage === undefined) return [];
      const text = passage.text.slice(0, query.passageLength);
      return [{ ...passage, text, spans: spans.filter(({ start }) => start < text.length) }];
    });

  return { concept, score, matchedFields: [...fields].sort(), passages };
};

const toResult = (ranked: RankedConcept): KnowledgeConceptResult => {
  const { projected } = ranked.concept;
  return {
    ref: ranked.concept.ref,
    orderingKey: `${ranked.concept.ref.bundle}#${ranked.concept.ref.conceptId}`,
    matchedFields: ranked.matchedFields,
    passages: ranked.passages,
    kind: projected.kind,
    ...(projected.title === undefined ? {} : { title: projected.title }),
    ...(projected.description === undefined ? {} : { description: projected.description }),
    ...(projected.status === undefined ? {} : { status: projected.status }),
    ...(projected.staleAfter === undefined ? {} : { staleAfter: projected.staleAfter }),
    ...(projected.generated === undefined ? {} : { generated: projected.generated }),
    ...(projected.verified === undefined ? {} : { verified: projected.verified }),
    ...(projected.trust === undefined ? {} : { trust: projected.trust }),
    relativePath: projected.relativePath,
  };
};

export const queryKnowledgeIndexResult = (
  snapshot: KnowledgeIndexSnapshot,
  query: KnowledgeQuery,
  now: number,
): Result.Result<KnowledgeQueryPage, KnowledgeCursorInvalidError> => {
  const ranked = snapshot.concepts.flatMap((concept) => {
    const candidate = rankConcept(concept, query);
    return candidate === undefined ? [] : [candidate];
  });
  ranked.sort((left, right) => {
    if (query.ordering === "relevance" && left.score !== right.score)
      return right.score - left.score;
    return (
      left.concept.ref.bundle.localeCompare(right.concept.ref.bundle) ||
      left.concept.ref.conceptId.localeCompare(right.concept.ref.conceptId)
    );
  });
  const decoded =
    query.cursor === undefined
      ? Result.succeed({ offset: 0 })
      : decodeCursor(query.cursor, snapshot, query, now);
  if (!Result.isSuccess(decoded)) return Result.fail(decoded.failure);
  const offset = decoded.success.offset;
  if (offset > ranked.length) {
    return Result.fail(new KnowledgeCursorInvalidError({ reason: "invalid" }));
  }
  const items = ranked.slice(offset, offset + query.resultLimit).map(toResult);
  const nextOffset = offset + items.length;
  const hasMore = nextOffset < ranked.length;
  return Result.succeed({
    items,
    count: ranked.length,
    hasMore,
    ...(hasMore
      ? {
          cursor: encodeCursor({
            version: CURSOR_VERSION,
            corpusFingerprint: snapshot.fingerprint,
            queryDigest: queryDigest(query),
            offset: nextOffset,
            issuedAt: now,
          }),
        }
      : {}),
  });
};

export const queryKnowledgeIndex = (
  snapshot: KnowledgeIndexSnapshot,
  query: KnowledgeQuery,
  now: number,
): KnowledgeQueryPage => {
  const result = queryKnowledgeIndexResult(snapshot, query, now);
  if (Result.isSuccess(result)) return result.success;
  throw result.failure;
};

export const getKnowledgeIndexConcept = (
  snapshot: KnowledgeIndexSnapshot,
  bundle: string,
  conceptId: string,
): KnowledgeIndexedConcept | undefined =>
  snapshot.concepts.find(
    (concept) => concept.ref.bundle === bundle && concept.ref.conceptId === conceptId,
  );

export interface KnowledgeIndexService {
  readonly makeSnapshot: (
    bundles: ReadonlyArray<KnowledgeIndexBundleInput>,
  ) => Effect.Effect<KnowledgeIndexSnapshot>;
  readonly query: (
    snapshot: KnowledgeIndexSnapshot,
    query: KnowledgeQuery,
  ) => Effect.Effect<KnowledgeQueryPage, KnowledgeCursorInvalidError>;
}

export class KnowledgeIndex extends ServiceMap.Service<KnowledgeIndex, KnowledgeIndexService>()(
  "@agentxm/knowledge-query/knowledge-index/KnowledgeIndex",
) {}
