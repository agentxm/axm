/**
 * New pack operation — scaffolds a new pack directory with manifest.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import { makeAppError } from "../../app-error/index.js";
import {
  createCanonicalDirectory,
  recoverCanonicalDirectory,
  preflightCreateOnly,
} from "../../extensions/index.js";
import { decodeExtensionNameSync, formatFqn } from "@agentxm/extension-model/unstable/extensions";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  PACK_MANIFEST_FILENAME,
  PACK_MANIFEST_SCHEMA_URL,
} from "@agentxm/extension-model/unstable/packs/manifest-schema";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";

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
    if (ws.layout.scope !== "project") {
      return yield* makeAppError({
        code: "validation",
        detail: "New packs can only be scaffolded in a project workspace",
      });
    }
    const initialVersion = decodeVersionSync("0.0.1");

    const { name, owner } = op.args;
    const extensionName = decodeExtensionNameSync(name);
    const fqn = formatFqn({ owner, type: "pack", name: extensionName });

    // 1. Compute pack directory path
    const canonicalPath = path.join(ws.layout.authoredRoot("pack"), name);
    const configuredPacks = yield* ws.getConfiguredPackEntries();
    yield* recoverCanonicalDirectory({
      baseDir: base,
      canonicalPath,
    });
    yield* preflightCreateOnly({
      subject: "Pack",
      name,
      configured: Object.hasOwn(configuredPacks, name),
      destinations: [canonicalPath],
    });

    const manifest = {
      $schema: PACK_MANIFEST_SCHEMA_URL,
      owner,
      type: "pack",
      name: extensionName,
      version: initialVersion,
      dependencies: {},
    };

    yield* createCanonicalDirectory({
      baseDir: base,
      canonicalPath,
      subject: "Pack",
      requiredFiles: [PACK_MANIFEST_FILENAME],
      populate: (stagingPath) => {
        const manifestPath = path.join(stagingPath, PACK_MANIFEST_FILENAME);
        return Effect.gen(function* () {
          yield* fs.makeDirectory(stagingPath, { recursive: true }).pipe(
            Effect.mapError((e) =>
              makeAppError({
                code: "internal",
                detail: `Failed to create pack directory: ${stagingPath}`,
                cause: e,
              }),
            ),
          );
          yield* fs.writeFileString(manifestPath, JSON.stringify(manifest, null, 2) + "\n").pipe(
            Effect.mapError((e) =>
              makeAppError({
                code: "internal",
                detail: `Failed to write pack manifest: ${manifestPath}`,
                cause: e,
              }),
            ),
          );
        });
      },
    });

    return {
      result: "success",
      message: `Created pack ${fqn}`,
    } satisfies JobStepResult;
  });
