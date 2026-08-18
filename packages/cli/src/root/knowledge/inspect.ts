// @effect-diagnostics anyUnknownInErrorContext:off — inspection translates caller-owned opaque bundle accessor failures into findings
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  parseExtensionFqnParts,
} from "@agentxm/client-core/unstable/extensions";
import {
  KNOWLEDGE_EXTENSION_DIR,
  KNOWLEDGE_SOURCE_DIR,
  KnowledgeBundleFqnSchema,
  KnowledgeIndex,
  captureKnowledgeIndexBundles,
  inspectKnowledgePackage,
  readKnowledgePackageManifest,
} from "@agentxm/client-core/unstable/knowledge";
import type { KnowledgeLockEntry } from "@agentxm/client-core/unstable/lockfile";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";

export { inspectKnowledgePackage } from "@agentxm/client-core/unstable/knowledge";

export const bundleRoot = (
  baseDir: string,
  name: string,
  entry: KnowledgeLockEntry,
  path: Path.Path,
): string =>
  entry.type === "registry"
    ? path.join(
        baseDir,
        REGISTRY_EXTENSIONS_DIR,
        entry.owner,
        KNOWLEDGE_EXTENSION_DIR,
        name,
        KNOWLEDGE_SOURCE_DIR,
      )
    : path.join(
        baseDir,
        EXTERNAL_EXTENSIONS_DIR,
        KNOWLEDGE_EXTENSION_DIR,
        name,
        KNOWLEDGE_SOURCE_DIR,
      );

const desiredBundleRoot = (
  baseDir: string,
  node: { readonly name: string; readonly identity: string },
  entry: KnowledgeLockEntry | undefined,
  path: Path.Path,
): string | undefined => {
  if (node.identity.startsWith("workspace:")) {
    const identity = parseExtensionFqnParts(node.identity.slice("workspace:".length));
    return identity === undefined || identity.type !== "knowledge"
      ? undefined
      : path.join(
          baseDir,
          REGISTRY_EXTENSIONS_DIR,
          identity.owner,
          KNOWLEDGE_EXTENSION_DIR,
          identity.name,
          KNOWLEDGE_SOURCE_DIR,
        );
  }
  return entry === undefined ? undefined : bundleRoot(baseDir, node.name, entry, path);
};

const isCorpusChanging = (
  cause: unknown,
): cause is { readonly _tag: "KnowledgeCorpusChangingError" } =>
  typeof cause === "object" &&
  cause !== null &&
  "_tag" in cause &&
  cause._tag === "KnowledgeCorpusChangingError";

export const inspectInstalledKnowledge = Effect.fn("Knowledge.inspectInstalled")(function* (
  selectedName?: string,
) {
  const ws = yield* WorkspaceMutations;
  const path = yield* Path.Path;
  const locked = yield* ws.getLockedKnowledge();
  const graph = yield* ws.getDesiredStateGraph();
  if (!graph.complete) {
    return yield* makeAppError({
      code: "conflict",
      detail:
        "Knowledge desired state cannot be inspected until pack and declaration problems are fixed",
    });
  }
  const entries = graph.nodes
    .filter(
      (node) =>
        node.type === "knowledge" &&
        node.enabled &&
        (selectedName === undefined || node.name === selectedName),
    )
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((node): readonly [string, string] | undefined => {
      const sourceRoot = desiredBundleRoot(ws.baseDir, node, locked[node.name], path);
      return sourceRoot === undefined ? undefined : [node.name, sourceRoot];
    })
    .filter((entry): entry is readonly [string, string] => entry !== undefined);
  if (selectedName !== undefined && entries.length === 0) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Knowledge bundle "${selectedName}" is not installed`,
    });
  }
  return yield* Effect.forEach(
    entries,
    ([name, sourceRoot]) => {
      return inspectKnowledgePackage(path.dirname(sourceRoot)).pipe(
        Effect.map(({ inspection }) => ({ name, sourceRoot, inspection })),
        Effect.mapError((cause) =>
          makeAppError({
            code: "validation",
            detail: `Failed to inspect knowledge bundle "${name}"`,
            cause,
          }),
        ),
      );
    },
    { concurrency: "unbounded" },
  );
});

/** Capture the enabled installed corpus and build one live, source-backed index snapshot. */
export const captureInstalledKnowledgeIndex = Effect.fn("Knowledge.captureInstalledIndex")(
  function* (selectedName?: string) {
    const ws = yield* WorkspaceMutations;
    const path = yield* Path.Path;
    const index = yield* KnowledgeIndex;
    const locked = yield* ws.getLockedKnowledge();
    const graph = yield* ws.getDesiredStateGraph();
    if (!graph.complete) {
      return yield* makeAppError({
        code: "conflict",
        detail:
          "Knowledge desired state cannot be inspected until pack and declaration problems are fixed",
      });
    }
    const entries = graph.nodes
      .filter(
        (node) =>
          node.type === "knowledge" &&
          node.enabled &&
          (selectedName === undefined || node.name === selectedName),
      )
      .sort((left, right) => left.name.localeCompare(right.name))
      .flatMap((node) => {
        const sourceRoot = desiredBundleRoot(ws.baseDir, node, locked[node.name], path);
        return sourceRoot === undefined ? [] : [{ name: node.name, sourceRoot }];
      });
    if (selectedName !== undefined && entries.length === 0) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Knowledge bundle "${selectedName}" is not installed`,
      });
    }
    const prepared = yield* Effect.forEach(
      entries,
      ({ name, sourceRoot }) => {
        return readKnowledgePackageManifest(path.dirname(sourceRoot)).pipe(
          Effect.flatMap(({ manifest }) =>
            Schema.decodeUnknownEffect(KnowledgeBundleFqnSchema)(
              `${manifest.owner}/knowledge/${manifest.name}`,
            ).pipe(
              Effect.map((bundle) => ({
                name,
                bundle,
                version: manifest.version,
                sourceRoot,
              })),
            ),
          ),
          Effect.mapError((cause) =>
            makeAppError({
              code: "validation",
              detail: `Failed to read knowledge bundle "${name}" manifest`,
              cause,
            }),
          ),
        );
      },
      { concurrency: 16 },
    );
    const capturedResult = yield* Effect.result(captureKnowledgeIndexBundles(prepared));
    if (Result.isFailure(capturedResult)) {
      if (isCorpusChanging(capturedResult.failure)) {
        return { outcome: "corpus-changing" as const };
      }
      return yield* makeAppError({
        code: "validation",
        detail: "Failed to capture the installed Knowledge corpus",
        cause: capturedResult.failure,
      });
    }
    const captured = capturedResult.success;
    const snapshot = yield* index.makeSnapshot(captured);
    return { outcome: "ready" as const, snapshot, bundles: prepared };
  },
);
