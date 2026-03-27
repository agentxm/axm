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
import type { OperationHandler } from "../../workspace/apply-plan.js";
import type { Operation, OperationResult } from "../../workspace/plan.js";
import { Workspace } from "../../workspace/service-interface.js";
import {
  PACK_MANIFEST_FILENAME,
  RawPackManifestSchema,
  type RawPackManifest,
} from "../../extensions/index.js";
import { computePackPaths } from "../paths.js";
import { hashContent } from "./hash-content.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the remove-from-pack operation.
 */
export interface RemoveFromPackOperationArgs {
  /** Pack name (without profile). */
  readonly packName: string;
  /** Pack profile (e.g., "@myorg"). */
  readonly packProfile: string;
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
  FileSystem.FileSystem | Path.Path | Workspace
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const base = ws.baseDir;

    const { packName, packProfile, removals, manifestHash } = op.args;

    // 1. Short-circuit if nothing to remove
    if (removals.length === 0) {
      return { result: "no-op", message: "Nothing to remove" } satisfies OperationResult;
    }

    // 2. Read current manifest
    const packDir = computePackPaths(path.join, base, packProfile, packName);
    const manifestPath = path.join(packDir.canonicalPath, PACK_MANIFEST_FILENAME);

    const manifestContent = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PACK_NOT_FOUND",
          what: `Pack manifest not found at ${manifestPath}`,
          howToFix: "Ensure the pack exists on disk",
          cause: e,
        }),
      ),
    );

    // 3. Stale-check: compare content hash
    const currentHash = hashContent(manifestContent);
    if (currentHash !== manifestHash) {
      return yield* makeAppError({
        code: "PACK_MANIFEST_STALE",
        what: `Pack manifest is stale — it was modified since the plan was created`,
        howToFix: "Re-run the command to create a fresh plan",
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
          code: "PACK_MANIFEST_PARSE_FAILED",
          what: `Failed to parse pack manifest: ${manifestPath}`,
          cause: e,
        }),
    });

    const manifest = yield* Schema.decodeUnknownEffect(RawPackManifestSchema)(json).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PACK_MANIFEST_INVALID",
          what: `Invalid pack manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    const removalSet = new Set(removals);
    const updatedSkills = Object.fromEntries(
      Object.entries(manifest.skills ?? {}).filter(([name]) => !removalSet.has(name)),
    );
    const updatedCommands = Object.fromEntries(
      Object.entries(manifest.commands ?? {}).filter(([name]) => !removalSet.has(name)),
    );
    const updatedMcpServers = Object.fromEntries(
      Object.entries(manifest["mcp-servers"] ?? {}).filter(([name]) => !removalSet.has(name)),
    );
    const updatedManifest: RawPackManifest = {
      ...manifest,
      skills: updatedSkills,
      commands: updatedCommands,
      "mcp-servers": updatedMcpServers,
    };

    // 5. Write updated manifest
    yield* fs.writeFileString(manifestPath, JSON.stringify(updatedManifest, null, 2) + "\n").pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PACK_WRITE_FAILED",
          what: `Failed to write pack manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    return {
      result: "success",
      message: `Removed ${removals.length} extension(s) from pack`,
    } satisfies OperationResult;
  });
