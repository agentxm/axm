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
import { makeAppError } from "../../app-error/index.js";
import {
  type ResolvedExtensionMap,
  validateExactResolvedVersion,
  validateExactResolvedVersionMap,
} from "../../lockfile/index.js";
import type { ExactSemverVersion } from "../../version-constraints/index.js";
import type { PackExtensionRef } from "../refs.js";
import { SourceHostProviders } from "../../source-resolution/index.js";
import { CliRenderer } from "../../cli-renderer/index.js";
import type { OperationHandler } from "../../workspace/apply-plan.js";
import type { Operation } from "../../workspace/plan.js";
import type { JobStepResult } from "../../workspace/plan.js";
import { Workspace } from "../../workspace/service-interface.js";
import { copyExtensionDirectory } from "../../extensions/utils.js";
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
  /** Pack profile (e.g., "@acme") */
  readonly profile: string;
  /** Exact resolved version */
  readonly resolvedVersion: ExactSemverVersion;
  /** SRI integrity string */
  readonly integrity: string;
  /** Registry source name */
  readonly sourceName: string;
  /** Resolved skill FQNs to exact versions */
  readonly resolvedSkills: ResolvedExtensionMap;
  /** Resolved command FQNs to exact versions */
  readonly resolvedCommands: ResolvedExtensionMap;
  /** Resolved MCP server FQNs to exact versions */
  readonly resolvedMcpServers: ResolvedExtensionMap;
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
 * pack location (.axm/extensions/@profile/packs/pack-name/), then records
 * the pack in settings and lockfile.
 */
export const installPack: OperationHandler<
  InstallPackOperation,
  Workspace | CliRenderer | SourceHostProviders | FileSystem.FileSystem | Path.Path
> = (op) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const renderer = yield* CliRenderer;
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
      op.args.profile,
      op.args.packName,
    ).canonicalPath;

    // Keep fetch scope alive through copy; fetched directories are released on scope close.
    yield* Effect.scoped(
      Effect.gen(function* () {
        const fetched = yield* sources.fetch(op.args.ref).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "PACK_FETCH_FAILED",
              what: `Failed to fetch pack archive: ${error.message}`,
              cause: error,
            }),
          ),
        );

        yield* copyExtensionDirectory(fetched.directory, packDir).pipe(
          Effect.mapError((e) =>
            makeAppError({
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
        profile: op.args.profile,
        name: op.args.packName,
        resolvedVersion: op.args.resolvedVersion,
        integrity: op.args.integrity,
        sourceName: op.args.sourceName,
        installedAt: new Date(),
        updatedAt: new Date(),
        resolvedSkills: op.args.resolvedSkills,
        resolvedCommands: op.args.resolvedCommands,
        resolvedMcpServers: op.args.resolvedMcpServers,
        versionConstraint: op.args.versionConstraint,
      })
      .pipe(Effect.catch((e) => renderer.warn(`Pack metadata update failed: ${String(e)}`)));

    return {
      result: "success",
      message: `Installed pack ${op.args.packName}`,
    } satisfies JobStepResult;
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed({
        result: "error",
        message: `Failed to install pack: ${error.what}`,
        error,
      } satisfies JobStepResult),
    ),
  );
