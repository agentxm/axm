/**
 * Recovering the accepted Pack reference a lock entry records.
 *
 * A lock row carries the accepted version and its manifest content identity,
 * but not the member constraints the manifest declares, so a reference rebuilt
 * from the lock alone would expand to an empty closure and record the wrong
 * content identity. Fetching the accepted archive and decoding its manifest is
 * the only way to recover those constraints without re-resolving — and
 * re-resolving is exactly what an operation restoring accepted state must not
 * do.
 *
 * This lives with resolution rather than with either feature because both the
 * configured install closure and the reconciliation sweep's Pack recovery
 * restore from the same accepted authority.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import {
  PACK_MANIFEST_FILENAME,
  PackManifestSchema,
} from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { SourceHostProviders } from "@agentxm/extension-sources";
import { WorkspaceMutations, computePackManifestContentIdentity } from "@agentxm/workspace-state";

import { ExtensionResolutionFailed } from "./errors.js";

const refused = (fields: {
  readonly category: ExtensionResolutionFailed["category"];
  readonly detail: string;
  readonly cause?: unknown;
}): ExtensionResolutionFailed =>
  new ExtensionResolutionFailed({
    category: fields.category,
    detail: fields.detail,
    ...(fields.cause === undefined ? {} : { cause: fields.cause }),
  });

/**
 * Complete an accepted Pack reference with the member constraints its accepted
 * archive declares. The archive is fetched, its manifest decoded, and its
 * identity and content checked against the lock before any member resolves
 * from it, so a divergent archive refuses instead of silently reshaping the
 * closure.
 */
export const hydrateAcceptedPackRef: (
  name: string,
  ref: PackRef,
) => Effect.Effect<
  PackRef,
  ExtensionResolutionFailed,
  WorkspaceMutations | SourceHostProviders | FileSystem.FileSystem | Path.Path
> = Effect.fn("ExtensionResolution.hydrateAcceptedPackRef")(function* (name: string, ref: PackRef) {
  const ws = yield* WorkspaceMutations;
  const sources = yield* SourceHostProviders;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const locked = yield* ws.getLockedPack(name).pipe(
    Effect.mapError((cause) =>
      refused({
        category: "internal",
        detail: `Accepted Pack lock for ${name} could not be read`,
        cause,
      }),
    ),
  );
  if (Option.isNone(locked)) {
    return yield* refused({
      category: "conflict",
      detail: `Accepted Pack recovery has no lock authority for ${name}`,
    });
  }
  const manifest = yield* Effect.scoped(
    Effect.gen(function* () {
      const fetched = yield* sources.fetch(ref).pipe(
        Effect.mapError((cause) =>
          refused({
            category: "network",
            detail: `Failed to fetch accepted Pack ${ref.owner}/packs/${ref.name}@${ref.version}`,
            cause,
          }),
        ),
      );
      const manifestPath = path.join(fetched.directory, PACK_MANIFEST_FILENAME);
      const manifestText = yield* fs.readFileString(manifestPath).pipe(
        Effect.mapError((cause) =>
          refused({
            category: "validation",
            detail: `Accepted Pack archive has no readable manifest at ${manifestPath}`,
            cause,
          }),
        ),
      );
      const manifestJson = yield* Effect.try({
        try: (): unknown => JSON.parse(manifestText),
        catch: (cause) =>
          refused({
            category: "validation",
            detail: `Accepted Pack archive manifest is not valid JSON: ${manifestPath}`,
            cause,
          }),
      });
      return yield* Schema.decodeUnknownEffect(PackManifestSchema)(manifestJson).pipe(
        Effect.mapError((cause) =>
          refused({
            category: "validation",
            detail: `Accepted Pack archive manifest is invalid: ${manifestPath}`,
            cause,
          }),
        ),
      );
    }),
  );
  const observedContentIdentity = computePackManifestContentIdentity(manifest);
  if (
    manifest.owner !== ref.owner ||
    manifest.name !== ref.name ||
    manifest.version !== ref.version ||
    observedContentIdentity !== locked.value.manifestContentIdentity
  ) {
    return yield* refused({
      category: "conflict",
      detail: `Accepted Pack ${ref.owner}/packs/${ref.name}@${ref.version} content ${locked.value.manifestContentIdentity} does not match fetched archive ${manifest.owner}/packs/${manifest.name}@${manifest.version} content ${observedContentIdentity}`,
    });
  }
  return { ...ref, pack: { name: ref.pack.name, dependencies: manifest.dependencies } };
});
