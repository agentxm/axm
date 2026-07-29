/**
 * Install pack operation handler.
 *
 * Fetches the pack archive, extracts to the managed location, and
 * writes pack metadata to settings and lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { Option } from "effect/Option";
import { makeAppError } from "../../app-error/index.js";
import { computePackageContentHash, decodeExtensionNameSync } from "../../extensions/index.js";
import type { Handle } from "../../extensions/handle.js";
import {
  type ResolvedExtensionMap,
  validateExactResolvedVersion,
  validateExactResolvedVersionMap,
} from "../../lockfile/index.js";
import type { Version } from "../../version-constraints/version-constraints.js";
import type { PackRef } from "../refs.js";
import { SourceHostProviders } from "../../source-resolution/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { copyExtensionDirectory } from "../../extensions/utils.js";
import { computePackPaths } from "../paths.js";
import {
  PACK_MANIFEST_FILENAME,
  type PackManifest,
  PackManifestSchema,
} from "../manifest-schema.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Args for the install pack operation.
 */
export interface InstallPackOperationArgs {
  /** Pack name (e.g., "my-pack") */
  readonly packName: string;
  /** Pack owner (e.g., "@acme") */
  readonly owner: Handle;
  /** Exact resolved version */
  readonly resolvedVersion: Version;
  /** SRI integrity string */
  readonly integrity: string;
  /** Registry source name */
  readonly sourceName: string;
  readonly publisherBindingId: string;
  /** Resolved skill FQNs to exact versions */
  readonly resolvedSkills: ResolvedExtensionMap;
  /** Resolved command FQNs to exact versions */
  readonly resolvedCommands: ResolvedExtensionMap;
  /** Resolved MCP server FQNs to exact versions */
  readonly resolvedMcpServers: ResolvedExtensionMap;
  /** Resolved subagent FQNs to exact versions */
  readonly resolvedSubagents: ResolvedExtensionMap;
  /** Resolved rule FQNs to exact versions */
  readonly resolvedRules: ResolvedExtensionMap;
  /** Resolved hook FQNs to exact versions */
  readonly resolvedHooks: ResolvedExtensionMap;
  /** Version constraint from the original source (e.g. "^2.0.0"). Preserved in settings. */
  readonly versionRange: Option<string>;
  /** Pack extension ref for fetching the archive. */
  readonly ref: PackRef;
}

/**
 * Add a pack to the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type InstallPackOperation = Operation<"install-pack", InstallPackOperationArgs>;

const collectMissingResolvedDependencies = (
  manifest: PackManifest,
  op: InstallPackOperation,
): ReadonlyArray<string> => {
  const missing: string[] = [];
  for (const fqn of Object.keys(manifest.dependencies)) {
    if (
      !Object.hasOwn(op.args.resolvedSkills, fqn) &&
      !Object.hasOwn(op.args.resolvedCommands, fqn) &&
      !Object.hasOwn(op.args.resolvedMcpServers, fqn) &&
      !Object.hasOwn(op.args.resolvedSubagents, fqn) &&
      !Object.hasOwn(op.args.resolvedRules, fqn) &&
      !Object.hasOwn(op.args.resolvedHooks, fqn)
    ) {
      missing.push(fqn);
    }
  }
  return missing;
};

/**
 * Install pack operation handler.
 *
 * Fetches the pack archive via sources.fetch(), extracts to the managed
 * pack location (.axm/extensions/@owner/packs/pack-name/), then records
 * the pack in settings and lockfile.
 */
export const installPack: OperationHandler<
  InstallPackOperation,
  WorkspaceMutations | SourceHostProviders | FileSystem.FileSystem | Path.Path
> = (op) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const sources = yield* SourceHostProviders;
    const fs = yield* FileSystem.FileSystem;
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
    yield* validateExactResolvedVersionMap(
      `packs.${op.args.packName}.resolvedSubagents`,
      op.args.resolvedSubagents,
    );
    yield* validateExactResolvedVersionMap(
      `packs.${op.args.packName}.resolvedRules`,
      op.args.resolvedRules,
    );
    yield* validateExactResolvedVersionMap(
      `packs.${op.args.packName}.resolvedHooks`,
      op.args.resolvedHooks,
    );

    // Extract to managed location
    const packDir = computePackPaths(
      path.join,
      ws.baseDir,
      op.args.owner,
      op.args.packName,
    ).canonicalPath;

    // Keep fetch scope alive through copy; fetched directories are released on scope close.
    yield* Effect.scoped(
      Effect.gen(function* () {
        const fetched = yield* sources.fetch(op.args.ref).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "network",
              detail: `Failed to fetch pack archive: ${error.message}`,
              cause: error,
            }),
          ),
        );

        const manifestPath = path.join(fetched.directory, PACK_MANIFEST_FILENAME);
        const manifestContent = yield* fs.readFileString(manifestPath).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "internal",
              detail: `Failed to read fetched pack manifest: ${manifestPath}`,
              cause: error,
            }),
          ),
        );
        const manifestJson = yield* Effect.try({
          try: () => {
            const parsed: unknown = JSON.parse(manifestContent);
            return parsed;
          },
          catch: (error) =>
            makeAppError({
              code: "validation",
              detail: `Invalid JSON in fetched pack manifest: ${manifestPath}`,
              cause: error,
            }),
        });
        const manifest = yield* Schema.decodeUnknownEffect(PackManifestSchema)(manifestJson).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "validation",
              detail: `Invalid fetched pack manifest: ${manifestPath}`,
              cause: error,
            }),
          ),
        );

        const missingDependencies = collectMissingResolvedDependencies(manifest, op);
        if (missingDependencies.length > 0) {
          return yield* makeAppError({
            code: "internal",
            detail: `Pack ${op.args.packName} declares dependencies that were not resolved from registry metadata`,
            suggestions: [
              {
                description:
                  "Republish the pack or repair the registry metadata before installing this pack.",
              },
            ],
          });
        }

        yield* copyExtensionDirectory(fetched.directory, packDir).pipe(
          Effect.mapError((e) =>
            makeAppError({
              code: "internal",
              detail: `Failed to extract pack to ${packDir}`,
              cause: e,
            }),
          ),
        );
      }),
    );

    const sourceHash = yield* computePackageContentHash(packDir);

    // Write lockfile + settings
    const now = yield* DateTime.now;
    const metadataWarning = yield* ws
      .setPack({
        type: "registry",
        owner: op.args.owner,
        name: decodeExtensionNameSync(op.args.packName),
        resolvedVersion: op.args.resolvedVersion,
        integrity: op.args.integrity,
        sourceName: op.args.sourceName,
        publisherBindingId: op.args.publisherBindingId,
        sourceHash,
        installedAt: now,
        updatedAt: now,
        resolvedSkills: op.args.resolvedSkills,
        resolvedCommands: op.args.resolvedCommands,
        resolvedMcpServers: op.args.resolvedMcpServers,
        resolvedSubagents: op.args.resolvedSubagents,
        resolvedRules: op.args.resolvedRules,
        resolvedHooks: op.args.resolvedHooks,
        versionRange: op.args.versionRange,
      })
      .pipe(
        Effect.as(undefined),
        Effect.catch((e) => Effect.succeed(`Pack metadata update failed: ${String(e)}`)),
      );

    return {
      result: "success",
      message:
        metadataWarning === undefined
          ? `Installed pack ${op.args.packName}`
          : `Installed pack ${op.args.packName}; ${metadataWarning}`,
    } satisfies JobStepResult;
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed({
        result: "error",
        message: `Failed to install pack: ${error.message}`,
        error,
      } satisfies JobStepResult),
    ),
  );
