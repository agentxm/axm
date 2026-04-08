/**
 * New extension pack operation — scaffolds a new extension pack directory with manifest,
 * and registers in settings/lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "../../app-error/index.js";
import { decodeExtensionNameSync, formatFqn } from "../../extensions/index.js";
import type { Handle } from "../../extensions/handle.js";
import {
  EXTENSION_PACK_MANIFEST_FILENAME,
  EXTENSION_PACK_MANIFEST_SCHEMA_URL,
} from "../manifest-schema.js";
import type { OperationHandler } from "../../workspace/apply-plan.js";
import type { Operation } from "../../workspace/plan.js";
import type { JobStepResult } from "../../workspace/plan.js";
import { Workspace } from "../../workspace/service-interface.js";
import { computeExtensionPackPaths } from "../paths.js";
import { decodeExactSemverVersionSync } from "../../version-constraints/version-constraints.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the new extension pack operation.
 */
export interface NewExtensionPackOperationArgs {
  /** Pack name (without owner). */
  readonly name: string;
  /** Profile (e.g., "@myorg"). */
  readonly owner: Handle;
}

/**
 * Scaffold a new extension pack in the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type NewExtensionPackOperation = Operation<"new-pack", NewExtensionPackOperationArgs>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * New extension pack operation handler.
 *
 * 1. Compute extension pack directory path
 * 2. Check if extension pack manifest already exists
 * 3. Create extension pack directory
 * 4. Write extension-pack.json manifest
 * 5. Register in settings via ws.setExtensionPack
 */
export const newExtensionPack: OperationHandler<
  NewExtensionPackOperation,
  FileSystem.FileSystem | Path.Path | Workspace
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const base = ws.baseDir;
    const initialVersion = decodeExactSemverVersionSync("0.0.1");

    const { name, owner } = op.args;
    const extensionName = decodeExtensionNameSync(name);
    const fqn = formatFqn({ owner, type: "pack", name: extensionName });

    // 1. Compute extension pack directory path
    const packDir = computeExtensionPackPaths(path.join, base, owner, name);
    const manifestPath = path.join(packDir.canonicalPath, EXTENSION_PACK_MANIFEST_FILENAME);

    // 2. Check if extension pack manifest already exists
    const exists = yield* fs.exists(manifestPath).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PACK_CHECK_FAILED",
          what: `Failed to check if extension pack exists: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    if (exists) {
      return yield* makeAppError({
        code: "PACK_ALREADY_EXISTS",
        what: `Extension pack '${fqn}' already exists at ${packDir.canonicalPath}`,
        howToFix: "Choose a different name or remove the existing extension pack first",
      });
    }

    // 3. Create extension pack directory
    yield* fs.makeDirectory(packDir.canonicalPath, { recursive: true }).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PACK_CREATE_FAILED",
          what: `Failed to create extension pack directory: ${packDir.canonicalPath}`,
          cause: e,
        }),
      ),
    );

    // 4. Write manifest
    const manifest = {
      $schema: EXTENSION_PACK_MANIFEST_SCHEMA_URL,
      owner,
      type: "pack",
      name: extensionName,
      version: initialVersion,
      skills: {},
      commands: {},
      "mcp-servers": {},
    };

    yield* fs.writeFileString(manifestPath, JSON.stringify(manifest, null, 2) + "\n").pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PACK_CREATE_FAILED",
          what: `Failed to write extension pack manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    // 5. Register in settings (best-effort: directory/manifest already on disk)
    const now = new Date();
    yield* ws
      .setExtensionPack({
        owner,
        name: extensionName,
        resolvedVersion: initialVersion,
        integrity: "",
        sourceName: "",
        installedAt: now,
        updatedAt: now,
        resolvedSkills: {},
        resolvedCommands: {},
        resolvedMcpServers: {},
        resolvedSubagents: {},
        versionConstraint: Option.none(),
      })
      .pipe(Effect.ignore);

    return {
      result: "success",
      message: `Created extension pack ${fqn}`,
    } satisfies JobStepResult;
  });
