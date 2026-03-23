/**
 * Install-pack operation handler.
 *
 * Fetches the pack archive, extracts to the managed location, and
 * writes pack metadata to settings and lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import type { Option } from "effect/Option";
import { makeCliError } from "../../../cli-error/index.js";
import {
  validateExactResolvedVersion,
  validateExactResolvedVersionMap,
} from "../../../lockfile/index.js";
import { SourceHostProviders } from "../../../sources/index.js";
import type { PackExtensionRef } from "../../../sources/types.js";
import { Log } from "../../../clack-effect/index.js";
import type { OperationHandler } from "../../../workspace/apply-plan.js";
import type { Operation, OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service.js";
import { copySkillDirectory } from "../../skills/operations/copy-directory.js";
import { computePackPaths } from "../paths.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Args for the install-pack operation.
 */
export interface InstallPackOperationArgs {
  /** Pack name (e.g., "my-pack") */
  readonly packName: string;
  /** Pack namespace (e.g., "@acme") */
  readonly namespace: string;
  /** Exact resolved version */
  readonly resolvedVersion: string;
  /** SRI integrity string */
  readonly integrity: string;
  /** Registry source name */
  readonly sourceName: string;
  /** Resolved skill FQNs to exact versions */
  readonly resolvedSkills: Readonly<Record<string, string>>;
  /** Resolved command FQNs to exact versions */
  readonly resolvedCommands: Readonly<Record<string, string>>;
  /** Resolved MCP server FQNs to exact versions */
  readonly resolvedMcpServers: Readonly<Record<string, string>>;
  /** Version constraint from the original source (e.g. "^2.0.0"). Preserved in settings. */
  readonly versionConstraint: Option<string>;
  /** Pack extension ref for fetching the archive. */
  readonly ref: PackExtensionRef;
}

/**
 * Add a pack to the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type InstallPackOperation = Operation<"install-pack", InstallPackOperationArgs>;

/**
 * Install-pack operation handler.
 *
 * Fetches the pack archive via sources.fetch(), extracts to the managed
 * pack location (.axm/extensions/@namespace/packs/pack-name/), then records
 * the pack in settings and lockfile.
 */
export const installPack: OperationHandler<
  InstallPackOperation,
  Workspace | Log | SourceHostProviders | FileSystem.FileSystem | Path.Path
> = (op) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const log = yield* Log;
    const sources = yield* SourceHostProviders;
    const path = yield* Path.Path;

    yield* validateExactResolvedVersion(
      `packs.${op.args.packName}.resolvedVersion`,
      op.args.resolvedVersion,
    );
    yield* validateExactResolvedVersionMap(
      `packs.${op.args.packName}.resolvedSkills`,
      op.args.resolvedSkills,
    );
    yield* validateExactResolvedVersionMap(
      `packs.${op.args.packName}.resolvedCommands`,
      op.args.resolvedCommands,
    );
    yield* validateExactResolvedVersionMap(
      `packs.${op.args.packName}.resolvedMcpServers`,
      op.args.resolvedMcpServers,
    );

    // Extract to managed location
    const packDir = computePackPaths(
      path.join,
      ws.baseDir,
      op.args.namespace,
      op.args.packName,
    ).canonicalPath;

    // Keep fetch scope alive through copy; fetched directories are released on scope close.
    yield* Effect.scoped(
      Effect.gen(function* () {
        const fetched = yield* sources.fetch(op.args.ref).pipe(
          Effect.mapError((error) =>
            makeCliError({
              code: "PACK_FETCH_FAILED",
              what: `Failed to fetch pack archive: ${error.message}`,
              cause: error,
            }),
          ),
        );

        yield* copySkillDirectory(fetched.directory, packDir).pipe(
          Effect.mapError((e) =>
            makeCliError({
              code: "PACK_EXTRACT_FAILED",
              what: `Failed to extract pack to ${packDir}`,
              cause: e,
            }),
          ),
        );
      }),
    );

    // Write lockfile + settings
    yield* ws
      .setPack({
        namespace: op.args.namespace,
        name: op.args.packName,
        resolvedVersion: op.args.resolvedVersion,
        integrity: op.args.integrity,
        sourceName: op.args.sourceName,
        installedAt: new Date(),
        updatedAt: new Date(),
        resolvedSkills: { ...op.args.resolvedSkills },
        resolvedCommands: { ...op.args.resolvedCommands },
        resolvedMcpServers: { ...op.args.resolvedMcpServers },
        versionConstraint: op.args.versionConstraint,
      })
      .pipe(Effect.catch((e) => log.warn(`Pack metadata update failed: ${String(e)}`)));

    return {
      result: "success",
      message: `Installed pack ${op.args.packName}`,
    } satisfies OperationResult;
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed({
        result: "error",
        message: `Failed to install pack: ${error.what}`,
        error,
      } satisfies OperationResult),
    ),
  );
