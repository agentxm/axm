/**
 * New pack operation — scaffolds a new pack directory with manifest.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import { makeAppError } from "../../app-error/index.js";
import { decodeExtensionNameSync, formatFqn, preflightCreateOnly } from "../../extensions/index.js";
import type { Handle } from "../../extensions/handle.js";
import { PACK_MANIFEST_FILENAME, PACK_MANIFEST_SCHEMA_URL } from "../manifest-schema.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { computePackPaths } from "../paths.js";
import { decodeVersionSync } from "../../version-constraints/version-constraints.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the new pack operation.
 */
export interface NewPackOperationArgs {
  /** Pack name (without owner). */
  readonly name: string;
  /** Profile (e.g., "@myorg"). */
  readonly owner: Handle;
}

/**
 * Scaffold a new pack in the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type NewPackOperation = Operation<"new-pack", NewPackOperationArgs>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * New pack operation handler.
 *
 * 1. Compute pack directory path
 * 2. Check if pack manifest already exists
 * 3. Create pack directory
 * 4. Write pack.json manifest
 */
export const newPack: OperationHandler<
  NewPackOperation,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const base = ws.baseDir;
    const initialVersion = decodeVersionSync("0.0.1");

    const { name, owner } = op.args;
    const extensionName = decodeExtensionNameSync(name);
    const fqn = formatFqn({ owner, type: "pack", name: extensionName });

    // 1. Compute pack directory path
    const packDir = computePackPaths(path.join, base, owner, name);
    const manifestPath = path.join(packDir.canonicalPath, PACK_MANIFEST_FILENAME);
    const configuredPacks = yield* ws.getConfiguredPackEntries();
    yield* preflightCreateOnly({
      subject: "Pack",
      name,
      configured: Object.hasOwn(configuredPacks, name),
      destinations: [packDir.canonicalPath],
    });

    // 3. Create pack directory
    yield* fs.makeDirectory(packDir.canonicalPath, { recursive: true }).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to create pack directory: ${packDir.canonicalPath}`,
          cause: e,
        }),
      ),
    );

    // 4. Write manifest
    const manifest = {
      $schema: PACK_MANIFEST_SCHEMA_URL,
      owner,
      type: "pack",
      name: extensionName,
      version: initialVersion,
      dependencies: {},
    };

    yield* fs.writeFileString(manifestPath, JSON.stringify(manifest, null, 2) + "\n").pipe(
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
      message: `Created pack ${fqn}`,
    } satisfies JobStepResult;
  });
