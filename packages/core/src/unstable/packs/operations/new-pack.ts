/**
 * New pack operation — scaffolds a new pack directory with manifest,
 * and registers in settings/lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "../../app-error/index.js";
import { formatFqn } from "../../extensions/index.js";
import { PACK_MANIFEST_FILENAME } from "../manifest-schema.js";
import type { OperationHandler } from "../../workspace/apply-plan.js";
import type { Operation } from "../../workspace/plan.js";
import type { JobStepResult } from "../../workspace/plan.js";
import { Workspace } from "../../workspace/service-interface.js";
import { computePackPaths } from "../paths.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the new-pack operation.
 */
export interface NewPackOperationArgs {
  /** Pack name (without profile). */
  readonly name: string;
  /** Profile (e.g., "@myorg"). */
  readonly profile: string;
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
 * New-pack operation handler.
 *
 * 1. Compute pack directory path
 * 2. Check if pack manifest already exists
 * 3. Create pack directory
 * 4. Write axm-pack.json manifest
 * 5. Register in settings via ws.setPack
 */
export const newPack: OperationHandler<
  NewPackOperation,
  FileSystem.FileSystem | Path.Path | Workspace
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const base = ws.baseDir;

    const { name, profile } = op.args;
    const fqn = formatFqn({ handle: profile, type: "packs", name });

    // 1. Compute pack directory path
    const packDir = computePackPaths(path.join, base, profile, name);
    const manifestPath = path.join(packDir.canonicalPath, PACK_MANIFEST_FILENAME);

    // 2. Check if pack manifest already exists
    const exists = yield* fs.exists(manifestPath).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PACK_CHECK_FAILED",
          what: `Failed to check if pack exists: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    if (exists) {
      return yield* makeAppError({
        code: "PACK_ALREADY_EXISTS",
        what: `Pack '${fqn}' already exists at ${packDir.canonicalPath}`,
        howToFix: "Choose a different name or remove the existing pack first",
      });
    }

    // 3. Create pack directory
    yield* fs.makeDirectory(packDir.canonicalPath, { recursive: true }).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PACK_CREATE_FAILED",
          what: `Failed to create pack directory: ${packDir.canonicalPath}`,
          cause: e,
        }),
      ),
    );

    // 4. Write manifest
    const manifest = {
      profile,
      type: "pack",
      name,
      version: "0.0.1",
      skills: {},
      commands: {},
      "mcp-servers": {},
    };

    yield* fs.writeFileString(manifestPath, JSON.stringify(manifest, null, 2) + "\n").pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PACK_CREATE_FAILED",
          what: `Failed to write pack manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    // 5. Register in settings (best-effort: directory/manifest already on disk)
    const now = new Date();
    yield* ws
      .setPack({
        profile,
        name,
        resolvedVersion: "0.0.1",
        integrity: "",
        sourceName: "",
        installedAt: now,
        updatedAt: now,
        resolvedSkills: {},
        resolvedCommands: {},
        resolvedMcpServers: {},
        versionConstraint: Option.none(),
      })
      .pipe(Effect.ignore);

    return {
      result: "success",
      message: `Created pack ${fqn}`,
    } satisfies JobStepResult;
  });
