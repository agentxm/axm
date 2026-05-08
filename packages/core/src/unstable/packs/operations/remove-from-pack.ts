/**
 * Remove-from-extension-pack operation — applies a precomputed manifest-remove delta to an extension pack manifest.
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
import type { Handle } from "../../extensions/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import {
  EXTENSION_PACK_MANIFEST_FILENAME,
  ExtensionPackManifestSchema,
} from "../manifest-schema.js";
import { computeExtensionPackPaths } from "../paths.js";
import { hashContent } from "./hash-content.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the remove-from-extension-pack operation.
 */
export interface RemoveFromExtensionPackOperationArgs {
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
 * Remove extensions from an extension pack manifest.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type RemoveFromExtensionPackOperation = Operation<
  "remove-from-pack",
  RemoveFromExtensionPackOperationArgs
>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Remove-from-extension-pack operation handler.
 *
 * 1. Short-circuit if removals list is empty (no-op)
 * 2. Read current manifest and compute hash
 * 3. Compare hash with args.manifestHash (stale check)
 * 4. Apply removals to manifest
 * 5. Write updated manifest
 */
export const removeFromExtensionPack: OperationHandler<
  RemoveFromExtensionPackOperation,
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
      return { result: "success", message: "Nothing to remove" } satisfies JobStepResult;
    }

    // 2. Read current manifest
    const packDir = computeExtensionPackPaths(path.join, base, packOwner, packName);
    const manifestPath = path.join(packDir.canonicalPath, EXTENSION_PACK_MANIFEST_FILENAME);

    const manifestContent = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PACK_NOT_FOUND",
          category: "not_found",
          what: `Extension pack manifest not found at ${manifestPath}`,
          breadcrumbs: [
            { task: "Recover", description: "Ensure the extension pack exists on disk" },
          ],
          cause: e,
        }),
      ),
    );

    // 3. Stale-check: compare content hash
    const currentHash = hashContent(manifestContent);
    if (currentHash !== manifestHash) {
      return yield* makeAppError({
        code: "PACK_MANIFEST_STALE",
        category: "internal",
        what: `Extension pack manifest is stale — it was modified since the plan was created`,
        breadcrumbs: [
          { task: "Recover", description: "Re-run the command to create a fresh plan" },
        ],
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
          category: "validation",
          what: `Failed to parse extension pack manifest: ${manifestPath}`,
          cause: e,
        }),
    });

    const manifest = yield* Schema.decodeUnknownEffect(ExtensionPackManifestSchema)(json).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PACK_MANIFEST_INVALID",
          category: "validation",
          what: `Invalid extension pack manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    const removalSet = new Set(removals);
    const filterSection = (
      section: Readonly<Record<string, string>> | undefined,
    ): Record<string, string> =>
      Object.fromEntries(Object.entries(section ?? {}).filter(([name]) => !removalSet.has(name)));
    const updatedSkills = filterSection(manifest["skills"]);
    const updatedCommands = filterSection(manifest["commands"]);
    const updatedMcpServers = filterSection(manifest["mcp-servers"]);
    const updatedManifest = {
      ...manifest,
      owner: manifest.owner,
      type: manifest.type,
      name: manifest.name,
      version: manifest.version,
      skills: updatedSkills,
      commands: updatedCommands,
      "mcp-servers": updatedMcpServers,
    };

    // 5. Write updated manifest
    yield* fs.writeFileString(manifestPath, JSON.stringify(updatedManifest, null, 2) + "\n").pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PACK_WRITE_FAILED",
          category: "internal",
          what: `Failed to write extension pack manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    return {
      result: "success",
      message: `Removed ${removals.length} extension(s) from extension pack`,
    } satisfies JobStepResult;
  });
