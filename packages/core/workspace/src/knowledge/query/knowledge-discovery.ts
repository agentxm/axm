/**
 * The read-only application API behind `axm knowledge concepts …`.
 *
 * Each operation takes a typed request, captures the selected installed
 * corpus once, and returns the typed outcome document automation decodes.
 * Grammar, bounds, conditional-revision semantics, readiness, and the ranking
 * explanation are decided here; the application maps outcomes onto exit codes
 * and rendering.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import {
  KnowledgeRevisionSchema,
  parseConceptRef,
} from "@agentxm/extension-model/unstable/knowledge";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";

import { captureInstalledKnowledgeCorpus } from "./corpus/installed-corpus.js";
import type {
  KnowledgeConceptGetOutput,
  KnowledgeConceptQueryPage,
  KnowledgeConceptRelatedOutput,
  KnowledgeConceptResolveOutput,
} from "./documents.js";
import { KnowledgeConceptNotFound, KnowledgeRequestInvalid } from "./errors.js";
import { KNOWLEDGE_DISCOVERY_CAPABILITIES } from "./knowledge-capabilities.js";
import { relatedKnowledgeConcepts, resolveKnowledgeConcept } from "./knowledge-graph.js";
import {
  getKnowledgeIndexConcept,
  KnowledgeIndex,
  type KnowledgeIndexedConcept,
} from "./knowledge-index.js";
import {
  checkTraversalDepth,
  explainKnowledgeQuery,
  makeKnowledgeQueryRequest,
  makeKnowledgeSearchRequest,
  type KnowledgeQueryRequest,
  type KnowledgeSearchRequest,
} from "./query/request.js";

/** Every discovery operation reports the same two refusals it cannot recover from. */
export type KnowledgeDiscoveryOutcome<A> =
  | { readonly outcome: "corpus-changing" }
  | { readonly outcome: "cursor-expired" }
  | ({ readonly outcome: "ready" } & A);

const decodeRevision = Schema.decodeUnknownResult(KnowledgeRevisionSchema);

const conceptDocument = (
  indexed: KnowledgeIndexedConcept,
  raw: boolean,
): NonNullable<KnowledgeConceptGetOutput["concept"]> => {
  const source = indexed.source;
  return {
    ref: indexed.ref,
    projectionRevision: indexed.projectionRevision,
    kind: source.kind,
    ...(source.authoredTitle === undefined ? {} : { title: source.authoredTitle }),
    ...(source.type === undefined ? {} : { type: source.type }),
    ...(source.description === undefined ? {} : { description: source.description }),
    ...(source.tags === undefined ? {} : { tags: source.tags }),
    ...(source.resource === undefined ? {} : { resource: source.resource }),
    ...(source.status === undefined ? {} : { status: source.status }),
    ...(source.staleAfter === undefined ? {} : { staleAfter: source.staleAfter }),
    ...(source.generated === undefined ? {} : { generated: source.generated }),
    ...(source.verified === undefined ? {} : { verified: source.verified }),
    ...(source.trust === undefined ? {} : { trust: source.trust }),
    ...(source.frontmatter === undefined ? {} : { frontmatter: source.frontmatter }),
    relativePath: source.relativePath,
    body: source.body,
    ...(raw ? { raw: new TextDecoder().decode(indexed.sourceBytes) } : {}),
  };
};

const runPage = Effect.fn("Knowledge.runPage")(function* (args: {
  readonly query: Parameters<typeof explainKnowledgeQuery>[0];
  readonly bundle?: string;
  readonly explain: boolean;
}) {
  const index = yield* KnowledgeIndex;
  const captured = yield* captureInstalledKnowledgeCorpus(
    args.bundle === undefined ? undefined : { bundle: args.bundle },
  );
  if (captured.outcome === "corpus-changing") {
    return { outcome: "corpus-changing" } as const;
  }
  const pageResult = yield* Effect.result(index.query(captured.snapshot, args.query));
  if (!Result.isSuccess(pageResult)) return { outcome: "cursor-expired" } as const;
  const page: KnowledgeConceptQueryPage = {
    query: args.query,
    corpusFingerprint: captured.snapshot.fingerprint,
    ...pageResult.success,
    ...(args.explain ? { explanation: explainKnowledgeQuery(args.query) } : {}),
  };
  return { outcome: "ready", page } as const;
});

export const KnowledgeDiscovery = {
  /** Structured query over the installed corpus. */
  query: Effect.fn("KnowledgeDiscovery.query")(function* (
    request: KnowledgeQueryRequest & { readonly explain?: boolean },
  ) {
    const query = yield* makeKnowledgeQueryRequest(request);
    return yield* runPage({ query, explain: request.explain === true });
  }),

  /** Lexical search over the installed corpus. */
  search: Effect.fn("KnowledgeDiscovery.search")(function* (request: KnowledgeSearchRequest) {
    const query = yield* makeKnowledgeSearchRequest(request);
    return yield* runPage({ query, explain: false });
  }),

  /**
   * One concept by exact identity, optionally conditional on its content
   * revision. A changed revision is a reported outcome, not a failure: the
   * caller re-reads at the current revision.
   */
  get: Effect.fn("KnowledgeDiscovery.get")(function* (request: {
    readonly reference: string;
    readonly ifRevision?: string;
    readonly raw?: boolean;
  }) {
    const parsed = parseConceptRef(request.reference);
    if (!Result.isSuccess(parsed)) {
      return yield* new KnowledgeRequestInvalid({
        detail: "Expected a concept reference in @owner/knowledge/name#concept-id form",
      });
    }
    const expected =
      request.ifRevision === undefined ? undefined : decodeRevision(request.ifRevision);
    if (expected !== undefined && !Result.isSuccess(expected)) {
      return yield* new KnowledgeRequestInvalid({
        detail: "--if-revision must be an opaque sha256: revision",
      });
    }
    const captured = yield* captureInstalledKnowledgeCorpus();
    if (captured.outcome === "corpus-changing") return { outcome: "corpus-changing" } as const;
    const indexed = getKnowledgeIndexConcept(
      captured.snapshot,
      parsed.success.bundle,
      parsed.success.conceptId,
    );
    if (indexed === undefined) {
      return yield* new KnowledgeConceptNotFound({ reference: request.reference });
    }
    if (
      expected !== undefined &&
      Result.isSuccess(expected) &&
      expected.success !== indexed.ref.contentRevision
    ) {
      return {
        outcome: "revision-changed",
        document: {
          outcome: "failed",
          reason: "revision-changed",
          ref: indexed.ref,
          expectedRevision: expected.success,
          currentRevision: indexed.ref.contentRevision,
        } satisfies KnowledgeConceptGetOutput,
      } as const;
    }
    return {
      outcome: "ready",
      document: {
        outcome: "found",
        concept: conceptDocument(indexed, request.raw === true),
      } satisfies KnowledgeConceptGetOutput,
    } as const;
  }),

  /**
   * Resolve a reference to one installed concept. Fuzzy candidate matching is
   * an explicit request; without it, only an exact reference resolves.
   */
  resolve: Effect.fn("KnowledgeDiscovery.resolve")(function* (request: {
    readonly input: string;
    readonly fuzzy?: boolean;
  }) {
    const captured = yield* captureInstalledKnowledgeCorpus();
    if (captured.outcome === "corpus-changing") return { outcome: "corpus-changing" } as const;
    const resolved = resolveKnowledgeConcept(
      captured.snapshot,
      request.input,
      KNOWLEDGE_DISCOVERY_CAPABILITIES.limits.maximumFuzzyCandidates,
      request.fuzzy === true,
    );
    if (resolved.outcome === "not-found") {
      return {
        outcome: "not-found",
        document: { outcome: "not-found" } satisfies KnowledgeConceptResolveOutput,
      } as const;
    }
    const document: KnowledgeConceptResolveOutput =
      resolved.outcome === "ambiguous" ? { ...resolved, reason: "ambiguous-reference" } : resolved;
    return { outcome: resolved.outcome, document } as const;
  }),

  /** Traverse authored links and derived backlinks from one concept. */
  related: Effect.fn("KnowledgeDiscovery.related")(function* (request: {
    readonly reference: string;
    readonly maximumDepth?: number;
    readonly includeIndexBacklinks?: boolean;
  }) {
    const parsed = parseConceptRef(request.reference);
    if (!Result.isSuccess(parsed)) {
      return yield* new KnowledgeRequestInvalid({
        detail: "Expected a concept reference in @owner/knowledge/name#concept-id form",
      });
    }
    const maximumDepth = yield* checkTraversalDepth(request.maximumDepth ?? 1);
    const captured = yield* captureInstalledKnowledgeCorpus();
    if (captured.outcome === "corpus-changing") return { outcome: "corpus-changing" } as const;
    const root = getKnowledgeIndexConcept(
      captured.snapshot,
      parsed.success.bundle,
      parsed.success.conceptId,
    );
    if (root === undefined) {
      return yield* new KnowledgeConceptNotFound({ reference: request.reference });
    }
    const includesIndexBacklinks = request.includeIndexBacklinks === true;
    const items = relatedKnowledgeConcepts(captured.snapshot, parsed.success, maximumDepth, {
      includeIndexBacklinks: includesIndexBacklinks,
    });
    return {
      outcome: "ready",
      document: {
        ref: root.ref,
        maximumDepth,
        includesIndexBacklinks,
        items,
        count: items.length,
        corpusFingerprint: captured.snapshot.fingerprint,
      } satisfies KnowledgeConceptRelatedOutput,
    } as const;
  }),
};

export type { KnowledgeQueryRequest, KnowledgeSearchRequest, WorkspaceScope };
