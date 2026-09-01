/**
 * Remove-from-pack operation — applies a precomputed manifest-remove delta to a pack manifest.
 *
 * Validates manifest precondition (stale check) before writing.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { makeAppError } from "../../app-error/index.js";
import { appErrorToStepFailure } from "../../app-error/conversions.js";
import type { Handle } from "@agentxm/extension-model/unstable/extensions";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { surfaceRestorationIncomplete } from "../../workspace/transaction.js";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import {
  PACK_MANIFEST_FILENAME,
  PackManifestSchema,
} from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { packManifestArtifact } from "./artifact.js";
import { hashContent } from "./hash-content.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the remove-from-pack operation.
 */
export interface RemoveFromPackOperationArgs {
  /** Pack name (without owner). */
  readonly packName: string;
  /** Pack owner (e.g., "@myorg"). */
  readonly packOwner: Handle;
  /** Precomputed manifest delta: extension names to remove. */
  readonly removals: ReadonlyArray<string>;
  /** Manifest content hash at plan time for stale-check. */
  readonly manifestHash: string;
}

/**
 * Remove extensions from a pack manifest.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type RemoveFromPackOperation = Operation<"remove-from-pack", RemoveFromPackOperationArgs>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Remove-from-pack operation handler.
 *
 * 1. Short-circuit if removals list is empty (no-op)
 * 2. Read current manifest and compute hash
 * 3. Compare hash with args.manifestHash (stale check)
 * 4. Apply removals to manifest
 * 5. Write updated manifest
 */
export const removeFromPack: OperationHandler<
  RemoveFromPackOperation,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    if (ws.layout.scope !== "project") {
      return yield* makeAppError({
        code: "validation",
        detail: "Authored packs can only be edited in a project workspace",
      });
    }
    const { packName, packOwner, removals, manifestHash } = op.args;
    const configured = (yield* ws.getConfiguredPackEntries())[packName];
    if (configured === undefined || !isWorkspaceSourceLocator(configured.source)) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Pack "${packName}" is not an authored workspace pack`,
        recover: "Only workspace-authored packs can be edited in place.",
      });
    }
    // 1. Short-circuit if nothing to remove
    if (removals.length === 0) {
      return { result: "success", message: "No pack entries removed" } satisfies JobStepResult;
    }

    // 2. Read current manifest
    const manifestPath = path.join(
      ws.layout.authoredRoot("pack"),
      packName,
      PACK_MANIFEST_FILENAME,
    );
    yield* ws
      .runTransaction({
        targets: [manifestPath],
        transition: Effect.gen(function* () {
          const manifestContent = yield* fs.readFileString(manifestPath).pipe(
            Effect.mapError((e) =>
              makeAppError({
                code: "not_found",
                detail: `Pack manifest not found at ${manifestPath}`,
                suggestions: [{ description: "Ensure the pack exists on disk" }],
                cause: e,
              }),
            ),
          );

          // 3. Stale-check: compare content hash
          const currentHash = hashContent(manifestContent);
          if (currentHash !== manifestHash) {
            return yield* makeAppError({
              code: "conflict",
              detail: `Pack manifest is stale — it was modified since the plan was created`,
              suggestions: [{ description: "Re-run the command to create a fresh plan" }],
            });
          }

          // 4. Parse and apply removals
          const json = yield* Effect.try({
            try: () => {
              const parsed: unknown = JSON.parse(manifestContent);
              return parsed;
            },
            catch: (e) =>
              makeAppError({
                code: "validation",
                detail: `Failed to parse pack manifest: ${manifestPath}`,
                cause: e,
              }),
          });

          const manifest = yield* Schema.decodeUnknownEffect(PackManifestSchema)(json).pipe(
            Effect.mapError((e) =>
              makeAppError({
                code: "validation",
                detail: `Invalid pack manifest: ${manifestPath}`,
                cause: e,
              }),
            ),
          );

          const removalSet = new Set(removals);
          const dependencies = Object.fromEntries(
            Object.entries(manifest.dependencies).filter(([name]) => !removalSet.has(name)),
          );
          const updatedManifest = {
            ...manifest,
            owner: manifest.owner,
            type: manifest.type,
            name: manifest.name,
            version: manifest.version,
            dependencies,
          };
          const validatedUpdatedManifest = yield* Schema.decodeUnknownEffect(PackManifestSchema)(
            updatedManifest,
          ).pipe(
            Effect.mapError((cause) =>
              makeAppError({
                code: "validation",
                detail: `Updated pack manifest is invalid: ${manifestPath}`,
                cause,
              }),
            ),
          );

          // 5. Write updated manifest
          yield* fs
            .writeFileString(manifestPath, JSON.stringify(validatedUpdatedManifest, null, 2) + "\n")
            .pipe(
              Effect.mapError((e) =>
                makeAppError({
                  code: "internal",
                  detail: `Failed to write pack manifest: ${manifestPath}`,
                  cause: e,
                }),
              ),
            );
        }),
        validate: () =>
          fs.readFileString(manifestPath).pipe(
            Effect.flatMap((content) =>
              Effect.try({
                try: (): unknown => JSON.parse(content),
                catch: (cause) =>
                  makeAppError({
                    code: "validation",
                    detail: `Updated pack manifest could not be parsed: ${manifestPath}`,
                    cause,
                  }),
              }),
            ),
            Effect.flatMap(Schema.decodeUnknownEffect(PackManifestSchema)),
            Effect.flatMap((manifest) =>
              removals.every((fqn) => manifest.dependencies[fqn] === undefined)
                ? Effect.void
                : makeAppError({
                    code: "internal",
                    detail: `Updated pack manifest retained a removed dependency`,
                  }),
            ),
            Effect.mapError((cause) =>
              makeAppError({
                code: "validation",
                detail: `Updated pack manifest failed postcondition validation`,
                cause,
              }),
            ),
          ),
      })
      .pipe(surfaceRestorationIncomplete);

    return {
      result: "success",
      message: `Removed ${removals.length} extension${removals.length === 1 ? "" : "s"} from pack`,
      artifact: packManifestArtifact({
        owner: packOwner,
        name: packName,
        scope: ws.scope,
        change: "updated",
        fileCount: 1,
      }),
    } satisfies JobStepResult;
  }).pipe(Effect.mapError(appErrorToStepFailure));
