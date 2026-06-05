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
import { count } from "../../cli-renderer/index.js";
import type { Handle } from "../../extensions/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { PACK_MANIFEST_FILENAME, PackManifestSchema } from "../manifest-schema.js";
import { computePackPaths } from "../paths.js";
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
    const base = ws.baseDir;

    const { packName, packOwner, removals, manifestHash } = op.args;

    // 1. Short-circuit if nothing to remove
    if (removals.length === 0) {
      return { result: "success", message: "No pack entries removed" } satisfies JobStepResult;
    }

    // 2. Read current manifest
    const packDir = computePackPaths(path.join, base, packOwner, packName);
    const manifestPath = path.join(packDir.canonicalPath, PACK_MANIFEST_FILENAME);

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

    // 5. Write updated manifest
    yield* fs.writeFileString(manifestPath, JSON.stringify(updatedManifest, null, 2) + "\n").pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to write pack manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    return {
      result: "success",
      message: `Removed ${count(removals.length, "extension")} from pack`,
      artifact: packManifestArtifact({
        owner: packOwner,
        name: packName,
        scope: ws.scope,
        change: "updated",
        fileCount: 1,
      }),
    } satisfies JobStepResult;
  });
