import * as Result from "effect/Result";
import { parseConceptRef, type ConceptRef, type ResolvedConceptRef } from "./concept-ref.js";
import {
  getKnowledgeIndexConcept,
  type KnowledgeIndexSnapshot,
  type KnowledgeIndexedConcept,
} from "./knowledge-index.js";
import { tokenizeKnowledgeSearchText } from "./knowledge-search.js";

export type KnowledgeRelation = "outgoing" | "backlink";

export interface KnowledgeRelatedConcept {
  readonly ref: ResolvedConceptRef;
  readonly title?: string;
  readonly relation: KnowledgeRelation;
  readonly depth: number;
  readonly via: ConceptRef;
  readonly evidence: {
    readonly source: ConceptRef;
    readonly sourceRelativePath: string;
    readonly line: number;
  };
  readonly orderingKey: string;
}

interface TraversalEntry {
  readonly concept: KnowledgeIndexedConcept;
  readonly depth: number;
}

const compactKey = (ref: ConceptRef): string => `${ref.bundle}#${ref.conceptId}`;

/** Traverse authored outgoing links and derived backlinks with cycle suppression. */
export const relatedKnowledgeConcepts = (
  snapshot: KnowledgeIndexSnapshot,
  start: ConceptRef,
  maximumDepth = 1,
  options?: { readonly includeIndexBacklinks?: boolean },
): ReadonlyArray<KnowledgeRelatedConcept> => {
  const root = getKnowledgeIndexConcept(snapshot, start.bundle, start.conceptId);
  if (root === undefined) return [];
  const depthLimit = Math.max(1, Math.min(3, maximumDepth));
  const visited = new Set([compactKey(start)]);
  const queue: TraversalEntry[] = [{ concept: root, depth: 0 }];
  const results: KnowledgeRelatedConcept[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || current.depth >= depthLimit) continue;
    const neighbors = [
      ...current.concept.projected.outgoingLinks.flatMap((link) =>
        link.resolvedConceptId === undefined
          ? []
          : [
              {
                relation: "outgoing" as const,
                conceptId: link.resolvedConceptId,
                evidence: {
                  source: {
                    bundle: current.concept.ref.bundle,
                    conceptId: current.concept.ref.conceptId,
                  },
                  sourceRelativePath: current.concept.projected.relativePath,
                  line: link.line,
                },
              },
            ],
      ),
      ...current.concept.projected.backlinks.flatMap((link) => {
        const source = getKnowledgeIndexConcept(
          snapshot,
          current.concept.ref.bundle,
          link.sourceConceptId,
        );
        if (source === undefined) return [];
        if (source.projected.kind === "index" && options?.includeIndexBacklinks !== true) return [];
        return [
          {
            relation: "backlink" as const,
            conceptId: link.sourceConceptId,
            evidence: {
              source: { bundle: source.ref.bundle, conceptId: source.ref.conceptId },
              sourceRelativePath: link.sourceRelativePath,
              line: link.line,
            },
          },
        ];
      }),
    ].sort(
      (left, right) =>
        left.conceptId.localeCompare(right.conceptId) ||
        left.relation.localeCompare(right.relation),
    );
    for (const neighbor of neighbors) {
      const indexed = getKnowledgeIndexConcept(
        snapshot,
        current.concept.ref.bundle,
        neighbor.conceptId,
      );
      if (indexed === undefined) continue;
      const key = compactKey(indexed.ref);
      if (visited.has(key)) continue;
      visited.add(key);
      const depth = current.depth + 1;
      results.push({
        ref: indexed.ref,
        ...(indexed.projected.title === undefined ? {} : { title: indexed.projected.title }),
        relation: neighbor.relation,
        depth,
        via: {
          bundle: current.concept.ref.bundle,
          conceptId: current.concept.ref.conceptId,
        },
        evidence: neighbor.evidence,
        orderingKey: `${String(depth).padStart(2, "0")}:${key}:${neighbor.relation}`,
      });
      queue.push({ concept: indexed, depth });
    }
  }
  return results.sort((left, right) => left.orderingKey.localeCompare(right.orderingKey));
};

export interface KnowledgeResolveCandidate {
  readonly ref: ResolvedConceptRef;
  readonly title?: string;
  readonly reason: "exact-reference" | "exact-concept-id" | "exact-title" | "token-match";
  readonly score: number;
  readonly orderingKey: string;
}

export type KnowledgeResolveResult =
  | { readonly outcome: "resolved"; readonly candidate: KnowledgeResolveCandidate }
  | { readonly outcome: "ambiguous"; readonly candidates: ReadonlyArray<KnowledgeResolveCandidate> }
  | { readonly outcome: "not-found"; readonly candidates: ReadonlyArray<never> };

const normalized = (value: string): string => value.normalize("NFKC").toUpperCase().toLowerCase();

const candidate = (
  concept: KnowledgeIndexedConcept,
  reason: KnowledgeResolveCandidate["reason"],
  score: number,
): KnowledgeResolveCandidate => ({
  ref: concept.ref,
  ...(concept.projected.title === undefined ? {} : { title: concept.projected.title }),
  reason,
  score,
  orderingKey: `${concept.ref.bundle}#${concept.ref.conceptId}`,
});

/** Resolve an exact concept ref or return a bounded deterministic fuzzy candidate set. */
export const resolveKnowledgeConcept = (
  snapshot: KnowledgeIndexSnapshot,
  input: string,
  maximumCandidates = 10,
  fuzzy = false,
): KnowledgeResolveResult => {
  const parsed = parseConceptRef(input);
  if (Result.isSuccess(parsed)) {
    const exact = getKnowledgeIndexConcept(
      snapshot,
      parsed.success.bundle,
      parsed.success.conceptId,
    );
    return exact === undefined
      ? { outcome: "not-found", candidates: [] }
      : { outcome: "resolved", candidate: candidate(exact, "exact-reference", 100) };
  }

  if (!fuzzy) return { outcome: "not-found", candidates: [] };

  const expected = normalized(input);
  const queryTokens = tokenizeKnowledgeSearchText(input);
  const candidates = snapshot.concepts
    .flatMap((concept): ReadonlyArray<KnowledgeResolveCandidate> => {
      if (normalized(concept.ref.conceptId) === expected) {
        return [candidate(concept, "exact-concept-id", 80)];
      }
      if (
        concept.projected.title !== undefined &&
        normalized(concept.projected.title) === expected
      ) {
        return [candidate(concept, "exact-title", 60)];
      }
      const candidateTokens = tokenizeKnowledgeSearchText(
        `${concept.ref.conceptId} ${concept.projected.title ?? ""}`,
      );
      if (queryTokens.length > 0 && queryTokens.every((token) => candidateTokens.includes(token))) {
        return [candidate(concept, "token-match", 20 + queryTokens.length)];
      }
      return [];
    })
    .sort(
      (left, right) =>
        right.score - left.score || left.orderingKey.localeCompare(right.orderingKey),
    )
    .slice(0, Math.max(1, Math.min(10, maximumCandidates)));
  if (candidates.length === 0) return { outcome: "not-found", candidates: [] };
  if (candidates.length === 1) {
    const first = candidates[0];
    return first === undefined
      ? { outcome: "not-found", candidates: [] }
      : { outcome: "resolved", candidate: first };
  }
  return { outcome: "ambiguous", candidates };
};
