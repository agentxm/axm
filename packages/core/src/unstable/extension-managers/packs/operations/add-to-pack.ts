/**
 * Add-to-pack operation — applies a precomputed manifest-add delta to a pack manifest.
 *
 * Validates manifest precondition (stale check) before writing.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { makeAppError } from "../../../app-error/index.js";
import type { OperationHandler } from "../../../workspace/apply-plan.js";
import type { Operation, OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service-interface.js";
import {
  PACK_MANIFEST_FILENAME,
  RawPackManifestSchema,
  type RawPackManifest,
  parseFqnOrThrow,
} from "../../../extensions/index.js";
import { computePackPaths } from "../paths.js";
import { hashContent } from "./hash-content.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the add-to-pack operation.
 */
export interface AddToPackOperationArgs {
  /** Pack name (without profile). */
  readonly packName: string;
  /** Pack profile (e.g., "@myorg"). */
  readonly packProfile: string;
  /** Precomputed manifest delta: FQN -> version range entries to add. */
  readonly additions: Readonly<Record<string, string>>;
  /** Manifest content hash at plan time for stale-check. */
  readonly manifestHash: string;
}

/**
 * Add extensions to a pack manifest.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type AddToPackOperation = Operation<"add-to-pack", AddToPackOperationArgs>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Add-to-pack operation handler.
 *
 * 1. Short-circuit if additions map is empty (no-op)
 * 2. Read current manifest and compute hash
 * 3. Compare hash with args.manifestHash (stale check)
 * 4. Apply additions to manifest
 * 5. Write updated manifest
 */
export const addToPack: OperationHandler<
  AddToPackOperation,
  FileSystem.FileSystem | Path.Path | Workspace
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const base = ws.baseDir;

    const { packName, packProfile, additions, manifestHash } = op.args;

    // 1. Short-circuit if nothing to add
    if (Object.keys(additions).length === 0) {
      return { result: "no-op", message: "Nothing to add" } satisfies OperationResult;
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

    // 4. Parse and apply additions
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

    const currentSkills = { ...(manifest.skills ?? {}) };
    const currentCommands = { ...(manifest.commands ?? {}) };
    const currentMcpServers = { ...(manifest["mcp-servers"] ?? {}) };

    for (const [fqn, version] of Object.entries(additions)) {
      const parsed = parseFqnOrThrow(fqn);
      switch (parsed.type) {
        case "skills":
          currentSkills[fqn] = version;
          break;
        case "commands":
          currentCommands[fqn] = version;
          break;
        case "mcp-servers":
          currentMcpServers[fqn] = version;
          break;
        case "packs":
          currentSkills[fqn] = version;
          break;
      }
    }

    const updatedManifest: RawPackManifest = {
      ...manifest,
      skills: currentSkills,
      commands: currentCommands,
      "mcp-servers": currentMcpServers,
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
      message: `Added ${Object.keys(additions).length} extension(s) to pack`,
    } satisfies OperationResult;
  });
