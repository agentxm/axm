/**
 * The selected workspace's enabled installed Knowledge bundles, as both the
 * corpus capture and Knowledge lint read them.
 *
 * One selection owns the document read phase, the failure vocabulary, and the
 * manifest the selection's observation already decoded, so the two readers
 * cannot drift. Each caller keeps its own fallback when no manifest was
 * captured and its own per-bundle failure wording.
 */

import * as Effect from "effect/Effect";
import * as Path from "effect/Path";

import {
  InstalledKnowledgeUnavailable,
  selectInstalledKnowledgeBundles,
} from "@agentxm/workspace-kernel/projection";
import {
  capturedManifestFor,
  withWorkspaceReadView,
} from "@agentxm/workspace-kernel/workspace-state";

import { KnowledgeCorpusUnavailable } from "../errors.js";

/** Select the enabled installed bundles, or one by name, in selection order. */
export const selectInstalledCorpusBundles = Effect.fnUntraced(function* (bundle?: string) {
  const path = yield* Path.Path;
  // The desired graph and the accepted resolutions read one document phase;
  // bundle content is read after it ends.
  const selected = yield* selectInstalledKnowledgeBundles({
    ...(bundle === undefined ? {} : { name: bundle }),
    captureManifests: true,
  }).pipe(
    Effect.catchTag("InstalledKnowledgeUnavailable", (failure: InstalledKnowledgeUnavailable) =>
      Effect.fail(
        new KnowledgeCorpusUnavailable({
          reason: failure.reason,
          detail: failure.detail,
          ...(failure.bundle === undefined ? {} : { bundle: failure.bundle }),
        }),
      ),
    ),
    withWorkspaceReadView,
  );
  return selected.map((entry) => ({
    name: entry.name,
    packageRoot: entry.packageRoot,
    sourceRoot: entry.sourceRoot,
    // The decode the selection's observation made of this package's manifest;
    // None when the caller must read the manifest itself.
    manifest: capturedManifestFor(path, entry.manifest, entry.packageRoot, "knowledge"),
  }));
});
