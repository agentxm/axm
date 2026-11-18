/**
 * The installed Knowledge corpus every discovery operation reads.
 *
 * One entry point: the selected workspace's enabled bundles are read through
 * the projection's selection fact, captured under a stable double read, and
 * indexed into one snapshot. Every operation — resolve, search, query, get,
 * related, status — starts here, so "which corpus did AXM read" has exactly
 * one answer.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { readKnowledgePackageManifest } from "@agentxm/extension-content/knowledge";
import {
  KnowledgeBundleFqnSchema,
  type KnowledgeBundleFqn,
} from "@agentxm/extension-model/unstable/knowledge";
import {
  InstalledKnowledgeUnavailable,
  selectInstalledKnowledgeBundles,
} from "@agentxm/workspace-kernel/projection";
import {
  capturedManifestFor,
  withWorkspaceReadView,
} from "@agentxm/workspace-kernel/workspace-state";

import { KnowledgeCorpusUnavailable } from "../errors.js";
import { captureKnowledgeIndexBundles } from "../knowledge-capture.js";
import { KnowledgeIndex, type KnowledgeIndexSnapshot } from "../knowledge-index.js";

/** One captured bundle: its workspace name, published identity, and version. */
export interface CapturedInstalledBundle {
  readonly name: string;
  readonly bundle: KnowledgeBundleFqn;
  readonly version: string;
  readonly sourceRoot: string;
}

type InstalledKnowledgeCorpus =
  | {
      readonly outcome: "ready";
      readonly snapshot: KnowledgeIndexSnapshot;
      readonly bundles: ReadonlyArray<CapturedInstalledBundle>;
    }
  | { readonly outcome: "corpus-changing" };

/**
 * Capture the enabled installed corpus and build one live, source-backed
 * index snapshot. A corpus that kept changing under the double read is a
 * reported outcome, not a failure: the caller retries rather than recovers.
 */
export const captureInstalledKnowledgeCorpus = Effect.fnUntraced(function* (options?: {
  readonly bundle?: string;
}) {
  const index = yield* KnowledgeIndex;
  const path = yield* Path.Path;
  // The desired graph and the accepted resolutions read one document phase;
  // bundle content is captured after it ends, under its own double read.
  const selected = yield* selectInstalledKnowledgeBundles({
    ...(options?.bundle === undefined ? {} : { name: options.bundle }),
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
  const prepared = yield* Effect.forEach(
    selected,
    (entry) =>
      Effect.flatMap(
        // The decode the selection's observation made of this package's
        // manifest; otherwise the manifest is read here.
        Option.match(capturedManifestFor(path, entry.manifest, entry.packageRoot, "knowledge"), {
          onSome: Effect.succeed,
          onNone: () =>
            Effect.map(readKnowledgePackageManifest(entry.packageRoot), ({ manifest }) => manifest),
        }),
        (manifest) =>
          Schema.decodeUnknownEffect(KnowledgeBundleFqnSchema)(
            `${manifest.owner}/knowledge/${manifest.name}`,
          ).pipe(
            Effect.map((bundle): CapturedInstalledBundle => ({
              name: entry.name,
              bundle,
              version: manifest.version,
              sourceRoot: entry.sourceRoot,
            })),
          ),
      ).pipe(
        Effect.mapError(
          (cause) =>
            new KnowledgeCorpusUnavailable({
              reason: "source-unreadable",
              detail: `Failed to read knowledge bundle "${entry.name}" manifest`,
              bundle: entry.name,
              cause,
            }),
        ),
      ),
    { concurrency: 16 },
  );
  const capturedResult = yield* Effect.result(captureKnowledgeIndexBundles(prepared));
  if (Result.isFailure(capturedResult)) {
    if (capturedResult.failure._tag === "KnowledgeCorpusChangingError") {
      return { outcome: "corpus-changing" } satisfies InstalledKnowledgeCorpus;
    }
    return yield* new KnowledgeCorpusUnavailable({
      reason: "source-unreadable",
      detail: "Failed to capture the installed Knowledge corpus",
      cause: capturedResult.failure,
    });
  }
  const snapshot = yield* index.makeSnapshot(capturedResult.success);
  return { outcome: "ready", snapshot, bundles: prepared } satisfies InstalledKnowledgeCorpus;
});
