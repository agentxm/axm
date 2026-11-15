import * as Effect from "effect/Effect";
import * as Path from "effect/Path";

import {
  KNOWLEDGE_SOURCE_DIR,
  type KnowledgeManifest,
} from "@agentxm/extension-model/unstable/knowledge/manifest-schema";
import { readExtensionManifest } from "../packaging/manifest-file.js";
import {
  inspectKnowledgeBundle,
  knowledgeDiagnostic,
  type KnowledgeDiagnostic,
  type KnowledgeInspection,
} from "./okf.js";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";

const missingManifestDescription = (): KnowledgeDiagnostic =>
  knowledgeDiagnostic({
    code: "missing-manifest-description",
    severity: "warning",
    relativePath: manifestFilenameForType("knowledge"),
    message: `${manifestFilenameForType("knowledge")} should include a concise bundle description for discovery.`,
  });

/** Read and decode one Knowledge package manifest without inspecting its bundle body. */
export const readKnowledgePackageManifest = Effect.fnUntraced(function* (packageRoot: string) {
  const path = yield* Path.Path;
  const { manifest } = yield* readExtensionManifest(packageRoot, "knowledge");
  const sourceRoot = path.join(packageRoot, KNOWLEDGE_SOURCE_DIR);
  return { sourceRoot, manifest };
});

/**
 * Inspect one complete Knowledge package whose manifest the caller already
 * decoded from `packageRoot`, including manifest-level profile diagnostics.
 */
export const inspectKnowledgePackageWithManifest = Effect.fnUntraced(function* (
  packageRoot: string,
  manifest: KnowledgeManifest,
) {
  const path = yield* Path.Path;
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

/** Inspect one complete Knowledge package, including manifest-level profile diagnostics. */
export const inspectKnowledgePackage = Effect.fnUntraced(function* (packageRoot: string) {
  const { manifest } = yield* readKnowledgePackageManifest(packageRoot);
  return yield* inspectKnowledgePackageWithManifest(packageRoot, manifest);
});
