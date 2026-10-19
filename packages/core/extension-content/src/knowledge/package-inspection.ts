// @effect-diagnostics anyUnknownInErrorContext:off — package accessors preserve caller-owned foreign read errors until diagnostic translation
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";

import { KNOWLEDGE_SOURCE_DIR } from "@agentxm/extension-model/unstable/knowledge/manifest-schema";
import { readExtensionManifest } from "../packaging/manifest-file.js";
import {
  inspectKnowledgeBundle,
  type KnowledgeDiagnostic,
  type KnowledgeInspection,
} from "./okf.js";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";

const missingManifestDescription = (): KnowledgeDiagnostic => ({
  code: "missing-manifest-description",
  severity: "warning",
  relativePath: manifestFilenameForType("knowledge"),
  message: `${manifestFilenameForType("knowledge")} should include a concise bundle description for discovery.`,
});

/** Read and decode one Knowledge package manifest without inspecting its bundle body. */
export const readKnowledgePackageManifest = Effect.fn("Knowledge.readPackageManifest")(function* (
  packageRoot: string,
) {
  const path = yield* Path.Path;
  const { manifest } = yield* readExtensionManifest(packageRoot, "knowledge");
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
