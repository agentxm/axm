// @effect-diagnostics anyUnknownInErrorContext:off — inspection translates caller-owned opaque bundle accessor failures into findings
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { makeAppError } from "../../app-error/index.js";
import {
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
  WorkspaceMutations,
  type WorkspaceLayout,
} from "@agentxm/workspace-state";
import {
  KNOWLEDGE_EXTENSION_DIR,
  KNOWLEDGE_SOURCE_DIR,
  KnowledgeBundleFqnSchema,
} from "@agentxm/extension-model/unstable/knowledge";
import { KnowledgeIndex, captureKnowledgeIndexBundles } from "@agentxm/knowledge-query";
import {
  inspectKnowledgePackage,
  readKnowledgePackageManifest,
} from "@agentxm/extension-workspace";
import type { KnowledgeLockEntry } from "@agentxm/workspace-state";

export { inspectKnowledgePackage } from "@agentxm/extension-workspace";

export const bundleRoot = (
  layout: WorkspaceLayout,
  _name: string,
  entry: KnowledgeLockEntry,
  path: Path.Path,
): string =>
  path.join(
    computeExtensionPathsForLayout(
      path.join,
      layout,
      extensionPathSourceFromLockEntry(entry),
      KNOWLEDGE_EXTENSION_DIR,
      entry.workspaceName,
    ).canonicalPath,
    KNOWLEDGE_SOURCE_DIR,
  );

const desiredBundleRoot = (
  layout: WorkspaceLayout,
  node: { readonly name: string; readonly identity: string },
  entry: KnowledgeLockEntry | undefined,
  path: Path.Path,
): string | undefined => {
  if (node.identity.startsWith("workspace:")) {
    return layout.scope !== "project"
      ? undefined
      : path.join(layout.authoredRoot("knowledge"), node.name, KNOWLEDGE_SOURCE_DIR);
  }
  return entry === undefined ? undefined : bundleRoot(layout, node.name, entry, path);
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
      const sourceRoot = desiredBundleRoot(ws.layout, node, locked[node.name], path);
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
        Effect.map(({ manifest, inspection }) => ({ name, sourceRoot, manifest, inspection })),
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
        const sourceRoot = desiredBundleRoot(ws.layout, node, locked[node.name], path);
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
