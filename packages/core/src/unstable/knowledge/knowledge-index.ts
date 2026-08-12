import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ServiceMap from "effect/Context";
import {
  type KnowledgeBundleFqn,
  type KnowledgeRevision,
  type ResolvedConceptRef,
} from "./concept-ref.js";
import { resolveKnowledgeFrontmatterPointer } from "./knowledge-projection.js";
import {
  projectKnowledgeConcepts,
  type KnowledgeBodyPassage,
  type KnowledgeProjectedConcept,
  type KnowledgeSearchableField,
  type KnowledgeSearchableUnit,
} from "./knowledge-projection.js";
import type {
  KnowledgeQuery,
  KnowledgeQueryClause,
  KnowledgeTextClause,
} from "./knowledge-query.js";
import {
  computeKnowledgeCorpusFingerprint,
  computeKnowledgeProjectionRevision,
  type CapturedKnowledgeSource,
} from "./knowledge-revision.js";
import { tokenizeKnowledgeSearchText } from "./knowledge-search.js";
import type { KnowledgeConcept, KnowledgeInspection } from "./okf.js";

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

const normalizedLiteral = (value: string): string => value.normalize("NFKC").toLowerCase();

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

const approximateSpan = (
  text: string,
  clause: KnowledgeTextClause,
  clauseIndex: number,
  field: KnowledgeSearchableField,
): KnowledgeMatchSpan | undefined => {
  const needle =
    clause.kind === "term" ? tokenizeKnowledgeSearchText(clause.value)[0] : clause.value;
  if (needle === undefined) return undefined;
  const start = normalizedLiteral(text).indexOf(normalizedLiteral(needle));
  if (start < 0) return undefined;
  return { clauseIndex, field, start, end: Math.min(text.length, start + needle.length) };
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
    for (const unit of matchingUnits(concept.projected, clause)) {
      fields.add(unit.field);
      score += fieldWeight(unit.field);
      if (unit.passageIndex === undefined) continue;
      const textClause = clause.kind === "field" ? clause.clause : clause;
      if (
        textClause.kind !== "term" &&
        textClause.kind !== "phrase" &&
        textClause.kind !== "literal"
      ) {
        continue;
      }
      const span = approximateSpan(unit.text, textClause, clauseIndex, unit.field);
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

export const queryKnowledgeIndex = (
  snapshot: KnowledgeIndexSnapshot,
  query: KnowledgeQuery,
): KnowledgeQueryPage => {
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
  return {
    items: ranked.slice(0, query.resultLimit).map(toResult),
    count: ranked.length,
    hasMore: ranked.length > query.resultLimit,
  };
};

export interface KnowledgeIndexService {
  readonly makeSnapshot: (
    bundles: ReadonlyArray<KnowledgeIndexBundleInput>,
  ) => Effect.Effect<KnowledgeIndexSnapshot>;
  readonly query: (
    snapshot: KnowledgeIndexSnapshot,
    query: KnowledgeQuery,
  ) => Effect.Effect<KnowledgeQueryPage>;
}

export class KnowledgeIndex extends ServiceMap.Service<KnowledgeIndex, KnowledgeIndexService>()(
  "@agentxm/client-core/unstable/knowledge/knowledge-index/KnowledgeIndex",
) {}

export const KnowledgeIndexLive = Layer.succeed(KnowledgeIndex, {
  makeSnapshot: (bundles) => Effect.sync(() => makeKnowledgeIndexSnapshot(bundles)),
  query: (snapshot, query) => Effect.sync(() => queryKnowledgeIndex(snapshot, query)),
});
