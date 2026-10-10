import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  DesiredStateReader,
  LockfileReader,
  readOtherScopeState,
  WorkspaceLocation,
} from "@agentxm/workspace-kernel/workspace-state";

import type { KnowledgeConceptCapabilitiesOutput } from "../documents.js";
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

/** Capture the selected corpus before reporting its capabilities and identity. */
export const reportKnowledgeDiscoveryCapabilities = Effect.fn(
  "Knowledge.reportDiscoveryCapabilities",
)(function* () {
  const captured = yield* captureInstalledKnowledgeCorpus();
  if (captured.outcome === "corpus-changing") return captured;
  const scopeCollisions = yield* crossScopeCollisions;
  return {
    outcome: "ready",
    document: {
      capabilities: KNOWLEDGE_DISCOVERY_CAPABILITIES,
      corpusFingerprint: captured.snapshot.fingerprint,
      bundleCount: captured.bundles.length,
      conceptCount: captured.snapshot.concepts.length,
      scopeCollisions,
    } satisfies KnowledgeConceptCapabilitiesOutput,
  } as const;
});
