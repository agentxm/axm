/**
 * What the installed Knowledge corpus can answer right now.
 *
 * Readiness is a tri-state the caller can act on: `ready` with the corpus
 * identity and counts, `changing` while sources are still being written, and
 * `unavailable` with an actionable diagnostic. The report also names the
 * bundles the unselected scope installs under the same names, so an operator
 * can tell which corpus a bare command would read.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";

import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  DesiredStateReader,
  LockfileReader,
  readOtherScopeState,
  WorkspaceLocation,
} from "@agentxm/workspace-state";

import type { KnowledgeConceptStatusOutput } from "../documents.js";
import { KNOWLEDGE_DISCOVERY_CAPABILITIES } from "../knowledge-capabilities.js";
import { captureInstalledKnowledgeCorpus } from "./installed-corpus.js";

/** The Knowledge bundle names this scope has both configured and accepted. */
const selectedKnowledgeNames = Effect.gen(function* () {
  const desiredState = yield* DesiredStateReader;
  const lockfile = yield* LockfileReader;
  const graph = yield* desiredState.graph();
  const locked = yield* lockfile.entries("knowledge");
  return new Set(
    graph.nodes.flatMap((node) =>
      node.type === "knowledge" && locked[node.name] !== undefined ? [node.name] : [],
    ),
  );
});

/** Bundle names the unselected scope installs under the same names. */
const crossScopeCollisions = Effect.gen(function* () {
  const location = yield* WorkspaceLocation;
  const fallbackScope: WorkspaceScope = location.scope === "project" ? "user" : "project";
  const other = yield* readOtherScopeState;
  if (Option.isNone(other)) {
    return { checkedScope: fallbackScope, state: "not-determined" as const, bundleNames: [] };
  }
  const current = yield* selectedKnowledgeNames;
  const configured = new Set(Object.keys(other.value.settings.knowledge ?? {}));
  const locked = new Set(Object.keys(other.value.lockfile.knowledge ?? {}));
  const bundleNames = [...current]
    .filter((name) => configured.has(name) && locked.has(name))
    .sort((left, right) => left.localeCompare(right));
  return { checkedScope: other.value.scope, state: "determined" as const, bundleNames };
});

/** An actionable sentence for whatever stopped the capture. */
const describeCaptureFailure = (failure: { readonly _tag: string }): string =>
  failure._tag === "KnowledgeCorpusUnavailable" && "detail" in failure
    ? String(failure.detail)
    : `The installed Knowledge corpus could not be read (${failure._tag}).`;

/** Report the discovery contract and the selected corpus's current health. */
export const reportKnowledgeCorpusStatus = Effect.fn("Knowledge.reportCorpusStatus")(function* () {
  const capturedResult = yield* Effect.result(captureInstalledKnowledgeCorpus());
  const scopeCollisions = yield* crossScopeCollisions;
  if (Result.isSuccess(capturedResult) && capturedResult.success.outcome === "ready") {
    const captured = capturedResult.success;
    return {
      capabilities: KNOWLEDGE_DISCOVERY_CAPABILITIES,
      readiness: "ready",
      health: { status: "healthy", diagnostics: [] },
      corpusFingerprint: captured.snapshot.fingerprint,
      bundleCount: captured.bundles.length,
      conceptCount: captured.snapshot.concepts.length,
      scopeCollisions,
    } satisfies KnowledgeConceptStatusOutput;
  }
  const diagnostic = Result.isFailure(capturedResult)
    ? `${describeCaptureFailure(capturedResult.failure)} Correct the source problem and retry.`
    : "The installed Knowledge corpus kept changing during capture. Retry after updates finish.";
  return {
    capabilities: KNOWLEDGE_DISCOVERY_CAPABILITIES,
    readiness: Result.isFailure(capturedResult) ? "unavailable" : "changing",
    health: { status: "unhealthy", diagnostics: [diagnostic] },
    bundleCount: 0,
    conceptCount: 0,
    scopeCollisions,
  } satisfies KnowledgeConceptStatusOutput;
});
