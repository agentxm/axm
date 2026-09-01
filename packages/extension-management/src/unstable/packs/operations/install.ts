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
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { Option } from "effect/Option";
import { makeAppError } from "../../app-error/index.js";
import { appErrorToStepFailure, toAppError } from "../../app-error/conversions.js";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import { recoverCanonicalDirectory, replaceCanonicalDirectory } from "../../extensions/index.js";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import { validateExactResolvedVersion } from "@agentxm/workspace-state";
import type { Version } from "@agentxm/extension-model/unstable/version-constraints";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import { SourceHostProviders } from "../../source-resolution/index.js";
import type { OperationHandler } from "@agentxm/workspace-operations";
import type { Operation } from "@agentxm/workspace-operations";
import type { JobStepResult } from "@agentxm/workspace-operations";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { copyExtensionDirectory } from "../../extensions/utils.js";
import { computePackPathsForLayout } from "@agentxm/workspace-state";
import {
  PACK_MANIFEST_FILENAME,
  type PackManifest,
  PackManifestSchema,
} from "@agentxm/extension-model/unstable/packs/manifest-schema";
import {
  type ResolvedPackDependencyMap,
  validateExactPackDependencyVersions,
} from "../resolved-dependency.js";
import { computePackManifestContentIdentity } from "@agentxm/workspace-state";
import { computeMaterializedTreeIntegrity } from "@agentxm/workspace-state";

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
  readonly resolvedSkills: ResolvedPackDependencyMap;
  /** Resolved MCP server FQNs to exact versions */
  readonly resolvedMcpServers: ResolvedPackDependencyMap;
  /** Resolved subagent FQNs to exact versions */
  readonly resolvedSubagents: ResolvedPackDependencyMap;
  /** Resolved rule FQNs to exact versions */
  readonly resolvedRules: ResolvedPackDependencyMap;
  /** Resolved hook FQNs to exact versions */
  readonly resolvedHooks: ResolvedPackDependencyMap;
  /** Resolved knowledge FQNs to exact versions */
  readonly resolvedKnowledge: ResolvedPackDependencyMap;
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
      !Object.hasOwn(op.args.resolvedMcpServers, fqn) &&
      !Object.hasOwn(op.args.resolvedSubagents, fqn) &&
      !Object.hasOwn(op.args.resolvedRules, fqn) &&
      !Object.hasOwn(op.args.resolvedHooks, fqn) &&
      !Object.hasOwn(op.args.resolvedKnowledge, fqn)
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
 * source-qualified acquired pack location, then records
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
    yield* validateExactPackDependencyVersions(
      `packs.${op.args.packName}.resolvedSkills`,
      op.args.resolvedSkills,
    );
    yield* validateExactPackDependencyVersions(
      `packs.${op.args.packName}.resolvedMcpServers`,
      op.args.resolvedMcpServers,
    );
    yield* validateExactPackDependencyVersions(
      `packs.${op.args.packName}.resolvedSubagents`,
      op.args.resolvedSubagents,
    );
    yield* validateExactPackDependencyVersions(
      `packs.${op.args.packName}.resolvedRules`,
      op.args.resolvedRules,
    );
    yield* validateExactPackDependencyVersions(
      `packs.${op.args.packName}.resolvedHooks`,
      op.args.resolvedHooks,
    );
    yield* validateExactPackDependencyVersions(
      `packs.${op.args.packName}.resolvedKnowledge`,
      op.args.resolvedKnowledge,
    );

    // Extract to managed location
    const packDir = computePackPathsForLayout(
      path.join,
      ws.layout,
      op.args.sourceName,
      op.args.owner,
      op.args.packName,
    ).canonicalPath;
    yield* recoverCanonicalDirectory({ baseDir: ws.baseDir, canonicalPath: packDir });

    // Keep fetch scope alive through copy; fetched directories are released on scope close.
    const manifestContentIdentity = yield* Effect.scoped(
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

        yield* replaceCanonicalDirectory({
          baseDir: ws.baseDir,
          canonicalPath: packDir,
          populate: (stagingPath) =>
            copyExtensionDirectory(fetched.directory, stagingPath).pipe(
              Effect.mapError((cause) =>
                makeAppError({
                  code: "internal",
                  detail: `Failed to stage pack at ${packDir}`,
                  cause,
                }),
              ),
            ),
        });
        return computePackManifestContentIdentity(manifest);
      }),
    );
    const treeIntegrity = yield* computeMaterializedTreeIntegrity(packDir);
    if (op.args.ref.source.type !== "registry") {
      return yield* makeAppError({
        code: "validation",
        detail: `Pack ${op.args.packName} does not resolve to a Registry source`,
      });
    }

    // Write lockfile + settings
    const metadataWarning = yield* ws
      .setPack({
        type: "registry",
        sourceType: "registry",
        packageFormat: "agentxm",
        endpoint: op.args.ref.source.location,
        extensionType: "pack",
        workspaceName: decodeExtensionNameSync(op.args.packName),
        owner: op.args.owner,
        name: decodeExtensionNameSync(op.args.packName),
        resolvedVersion: op.args.resolvedVersion,
        integrity: op.args.integrity,
        sourceName: op.args.sourceName,
        publisherBindingId: op.args.publisherBindingId,
        manifestContentIdentity,
        treeIntegrity,
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
    Effect.catch((error) => {
      const appError = toAppError(error);
      return Effect.succeed({
        result: "error",
        message: `Failed to install pack: ${appError.message}`,
        error: appErrorToStepFailure(appError),
      } satisfies JobStepResult);
    }),
  );
