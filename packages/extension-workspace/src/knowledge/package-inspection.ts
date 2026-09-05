// @effect-diagnostics anyUnknownInErrorContext:off — package accessors preserve caller-owned foreign read errors until diagnostic translation
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { KnowledgeDefinitionInvalid } from "./errors.js";
import {
  KNOWLEDGE_MANIFEST_FILENAME,
  KNOWLEDGE_SOURCE_DIR,
  KnowledgeManifestSchema,
} from "@agentxm/extension-model/unstable/knowledge/manifest-schema";
import {
  inspectKnowledgeBundle,
  type KnowledgeDiagnostic,
  type KnowledgeInspection,
} from "@agentxm/registry-protocol/unstable/knowledge/okf";

const missingManifestDescription = (): KnowledgeDiagnostic => ({
  code: "missing-manifest-description",
  severity: "warning",
  relativePath: KNOWLEDGE_MANIFEST_FILENAME,
  message: `${KNOWLEDGE_MANIFEST_FILENAME} should include a concise bundle description for discovery.`,
});

/** Read and decode one Knowledge package manifest without inspecting its bundle body. */
export const readKnowledgePackageManifest = Effect.fn("Knowledge.readPackageManifest")(function* (
  packageRoot: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const manifestPath = path.join(packageRoot, KNOWLEDGE_MANIFEST_FILENAME);
  const manifestRaw = yield* fs.readFileString(manifestPath);
  const manifestUnknown = yield* Effect.try({
    try: (): unknown => JSON.parse(manifestRaw),
    catch: (cause) =>
      new KnowledgeDefinitionInvalid({
        detail: `Failed to parse ${manifestPath}`,
        cause,
      }),
  });
  const manifest = yield* Schema.decodeUnknownEffect(KnowledgeManifestSchema)(manifestUnknown);
  const sourceRoot = path.join(packageRoot, KNOWLEDGE_SOURCE_DIR);
  return { sourceRoot, manifest };
});

/** Inspect one complete Knowledge package, including manifest-level profile diagnostics. */
export const inspectKnowledgePackage = Effect.fn("Knowledge.inspectPackage")(function* (
  packageRoot: string,
) {
  const { sourceRoot, manifest } = yield* readKnowledgePackageManifest(packageRoot);
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
