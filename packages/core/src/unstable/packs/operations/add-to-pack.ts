/**
 * Add-to-extension-pack operation — applies a precomputed manifest-add delta to an extension pack manifest.
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
import { parseFqnOrThrow } from "../../extensions/index.js";
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
 * Args for the add-to-extension-pack operation.
 */
export interface AddToExtensionPackOperationArgs {
  /** Pack name (without owner). */
  readonly packName: string;
  /** Pack owner (e.g., "@myorg"). */
  readonly packOwner: Handle;
  /** Precomputed manifest delta: FQN -> version range entries to add. */
  readonly additions: Readonly<Record<string, string>>;
  /** Manifest content hash at plan time for stale-check. */
  readonly manifestHash: string;
}

/**
 * Add extensions to an extension pack manifest.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type AddToExtensionPackOperation = Operation<"add-to-pack", AddToExtensionPackOperationArgs>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Add-to-extension-pack operation handler.
 *
 * 1. Short-circuit if additions map is empty (no-op)
 * 2. Read current manifest and compute hash
 * 3. Compare hash with args.manifestHash (stale check)
 * 4. Apply additions to manifest
 * 5. Write updated manifest
 */
export const addToExtensionPack: OperationHandler<
  AddToExtensionPackOperation,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const base = ws.baseDir;

    const { packName, packOwner, additions, manifestHash } = op.args;

    // 1. Short-circuit if nothing to add
    if (Object.keys(additions).length === 0) {
      return { result: "success", message: "Nothing to add" } satisfies JobStepResult;
    }

    // 2. Read current manifest
    const packDir = computeExtensionPackPaths(path.join, base, packOwner, packName);
    const manifestPath = path.join(packDir.canonicalPath, EXTENSION_PACK_MANIFEST_FILENAME);

    const manifestContent = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PACK_NOT_FOUND",
          what: `Extension pack manifest not found at ${manifestPath}`,
          howToFix: "Ensure the extension pack exists on disk",
          cause: e,
        }),
      ),
    );

    // 3. Stale-check: compare content hash
    const currentHash = hashContent(manifestContent);
    if (currentHash !== manifestHash) {
      return yield* makeAppError({
        code: "PACK_MANIFEST_STALE",
        what: `Extension pack manifest is stale — it was modified since the plan was created`,
        howToFix: "Re-run the command to create a fresh plan",
      });
    }

    // 4. Parse and apply additions
    const json = yield* Effect.try({
      try: () => {
        const parsed: unknown = JSON.parse(manifestContent);
        return parsed;
      },
      catch: (e) =>
        makeAppError({
          code: "PACK_MANIFEST_PARSE_FAILED",
          what: `Failed to parse extension pack manifest: ${manifestPath}`,
          cause: e,
        }),
    });

    const manifest = yield* Schema.decodeUnknownEffect(ExtensionPackManifestSchema)(json).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PACK_MANIFEST_INVALID",
          what: `Invalid extension pack manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    const currentSkills: Record<string, string> = { ...(manifest["skills"] ?? {}) };
    const currentCommands: Record<string, string> = { ...(manifest["commands"] ?? {}) };
    const currentMcpServers: Record<string, string> = { ...(manifest["mcp-servers"] ?? {}) };

    for (const [fqn, version] of Object.entries(additions)) {
      const parsed = parseFqnOrThrow(fqn);
      switch (parsed.type) {
        case "skill":
          currentSkills[fqn] = version;
          break;
        case "command":
          currentCommands[fqn] = version;
          break;
        case "mcp-server":
          currentMcpServers[fqn] = version;
          break;
        case "pack":
          currentSkills[fqn] = version;
          break;
      }
    }

    const updatedManifest = {
      ...manifest,
      owner: manifest.owner,
      type: manifest.type,
      name: manifest.name,
      version: manifest.version,
      skills: currentSkills,
      commands: currentCommands,
      "mcp-servers": currentMcpServers,
    };

    // 5. Write updated manifest
    yield* fs.writeFileString(manifestPath, JSON.stringify(updatedManifest, null, 2) + "\n").pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PACK_WRITE_FAILED",
          what: `Failed to write extension pack manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    return {
      result: "success",
      message: `Added ${Object.keys(additions).length} extension(s) to extension pack`,
    } satisfies JobStepResult;
  });
