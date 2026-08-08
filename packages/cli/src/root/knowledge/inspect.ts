import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
} from "@agentxm/client-core/unstable/extensions";
import {
  KNOWLEDGE_EXTENSION_DIR,
  KNOWLEDGE_MANIFEST_FILENAME,
  KNOWLEDGE_SOURCE_DIR,
  KnowledgeManifestSchema,
  inspectKnowledgeBundle,
  type KnowledgeDiagnostic,
  type KnowledgeInspection,
} from "@agentxm/client-core/unstable/knowledge";
import type { KnowledgeLockEntry } from "@agentxm/client-core/unstable/lockfile";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";

const missingManifestDescription = (): KnowledgeDiagnostic => ({
  code: "missing-manifest-description",
  severity: "warning",
  relativePath: KNOWLEDGE_MANIFEST_FILENAME,
  message: `${KNOWLEDGE_MANIFEST_FILENAME} should include a concise bundle description for discovery.`,
});

export const inspectKnowledgePackage = Effect.fn("Knowledge.inspectPackage")(function* (
  packageRoot: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const manifestRaw = yield* fs.readFileString(path.join(packageRoot, KNOWLEDGE_MANIFEST_FILENAME));
  const manifestUnknown = yield* Effect.try({
    try: (): unknown => JSON.parse(manifestRaw),
    catch: (cause) =>
      makeAppError({
        code: "validation",
        detail: `Failed to parse ${path.join(packageRoot, KNOWLEDGE_MANIFEST_FILENAME)}`,
        cause,
      }),
  });
  const manifest = yield* Schema.decodeUnknownEffect(KnowledgeManifestSchema)(manifestUnknown);
  const sourceRoot = path.join(packageRoot, KNOWLEDGE_SOURCE_DIR);
  const inspected = yield* inspectKnowledgeBundle(sourceRoot);
  const inspection: KnowledgeInspection = {
    ...inspected,
    diagnostics:
      manifest.description?.trim().length === 0 || manifest.description === undefined
        ? [missingManifestDescription(), ...inspected.diagnostics]
        : inspected.diagnostics,
  };
  return { name: manifest.name, sourceRoot, manifest, inspection };
});

export const bundleRoot = (
  baseDir: string,
  name: string,
  entry: KnowledgeLockEntry,
  path: Path.Path,
): string =>
  entry.type === "registry" || entry.type === "workspace"
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
    .map((node): readonly [string, KnowledgeLockEntry] | undefined => {
      const entry = locked[node.name];
      return entry === undefined ? undefined : [node.name, entry];
    })
    .filter((entry): entry is readonly [string, KnowledgeLockEntry] => entry !== undefined);
  if (selectedName !== undefined && entries.length === 0) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Knowledge bundle "${selectedName}" is not installed`,
    });
  }
  return yield* Effect.forEach(
    entries,
    ([name, entry]) => {
      const sourceRoot = bundleRoot(ws.baseDir, name, entry, path);
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
