/**
 * Install extension pack operation handler.
 *
 * Fetches the extension pack archive, extracts to the managed location, and
 * writes extension pack metadata to settings and lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { Option } from "effect/Option";
import { makeAppError } from "../../app-error/index.js";
import { decodeExtensionNameSync } from "../../extensions/index.js";
import type { Handle } from "../../extensions/handle.js";
import {
  type ResolvedExtensionMap,
  validateExactResolvedVersion,
  validateExactResolvedVersionMap,
} from "../../lockfile/index.js";
import type { ExactSemverVersion } from "../../version-constraints/version-constraints.js";
import type { ExtensionPackRef } from "../refs.js";
import { SourceHostProviders } from "../../source-resolution/index.js";
import { CliRenderer } from "../../cli-renderer/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { copyExtensionDirectory } from "../../extensions/utils.js";
import { computeExtensionPackPaths } from "../paths.js";
import {
  EXTENSION_PACK_MANIFEST_FILENAME,
  type ExtensionPackManifest,
  ExtensionPackManifestSchema,
} from "../manifest-schema.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Args for the install extension pack operation.
 */
export interface InstallExtensionPackOperationArgs {
  /** Pack name (e.g., "my-pack") */
  readonly packName: string;
  /** Pack owner (e.g., "@acme") */
  readonly owner: Handle;
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
  /** Resolved subagent FQNs to exact versions */
  readonly resolvedSubagents: ResolvedExtensionMap;
  /** Version constraint from the original source (e.g. "^2.0.0"). Preserved in settings. */
  readonly versionConstraint: Option<string>;
  /** Pack extension ref for fetching the archive. */
  readonly ref: ExtensionPackRef;
}

/**
 * Add an extension pack to the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type InstallExtensionPackOperation = Operation<
  "install-pack",
  InstallExtensionPackOperationArgs
>;

const PACK_DEPENDENCY_SECTIONS = [
  ["skills", "resolvedSkills"],
  ["commands", "resolvedCommands"],
  ["mcp-servers", "resolvedMcpServers"],
  ["subagents", "resolvedSubagents"],
] as const;

const collectMissingResolvedDependencies = (
  manifest: ExtensionPackManifest,
  op: InstallExtensionPackOperation,
): ReadonlyArray<string> =>
  PACK_DEPENDENCY_SECTIONS.flatMap(([manifestKey, resolvedKey]) =>
    Object.keys(manifest[manifestKey] ?? {}).filter(
      (fqn) => !Object.hasOwn(op.args[resolvedKey], fqn),
    ),
  );

/**
 * Install extension pack operation handler.
 *
 * Fetches the extension pack archive via sources.fetch(), extracts to the managed
 * extension pack location (.axm/extensions/@owner/packs/pack-name/), then records
 * the extension pack in settings and lockfile.
 */
export const installExtensionPack: OperationHandler<
  InstallExtensionPackOperation,
  WorkspaceMutations | CliRenderer | SourceHostProviders | FileSystem.FileSystem | Path.Path
> = (op) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const renderer = yield* CliRenderer;
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

    // Extract to managed location
    const packDir = computeExtensionPackPaths(
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
              code: "PACK_FETCH_FAILED",
              category: "internal",
              what: `Failed to fetch extension pack archive: ${error.message}`,
              cause: error,
            }),
          ),
        );

        const manifestPath = path.join(fetched.directory, EXTENSION_PACK_MANIFEST_FILENAME);
        const manifestContent = yield* fs.readFileString(manifestPath).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "PACK_MANIFEST_READ_FAILED",
              category: "internal",
              what: `Failed to read fetched extension pack manifest: ${manifestPath}`,
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
              code: "PACK_MANIFEST_PARSE_FAILED",
              category: "validation",
              what: `Invalid JSON in fetched extension pack manifest: ${manifestPath}`,
              cause: error,
            }),
        });
        const manifest = yield* Schema.decodeUnknownEffect(ExtensionPackManifestSchema)(
          manifestJson,
        ).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "PACK_MANIFEST_INVALID",
              category: "validation",
              what: `Invalid fetched extension pack manifest: ${manifestPath}`,
              cause: error,
            }),
          ),
        );

        const missingDependencies = collectMissingResolvedDependencies(manifest, op);
        if (missingDependencies.length > 0) {
          return yield* makeAppError({
            code: "PACK_DEPENDENCY_METADATA_MISMATCH",
            category: "internal",
            what: `Extension pack ${op.args.packName} declares dependencies that were not resolved from registry metadata`,
            breadcrumbs: [
              {
                task: "Recover",
                description:
                  "Republish the extension pack or repair the registry metadata before installing this pack.",
              },
            ],
          });
        }

        yield* copyExtensionDirectory(fetched.directory, packDir).pipe(
          Effect.mapError((e) =>
            makeAppError({
              code: "PACK_EXTRACT_FAILED",
              category: "internal",
              what: `Failed to extract extension pack to ${packDir}`,
              cause: e,
            }),
          ),
        );
      }),
    );

    // Write lockfile + settings
    yield* ws
      .setExtensionPack({
        owner: op.args.owner,
        name: decodeExtensionNameSync(op.args.packName),
        resolvedVersion: op.args.resolvedVersion,
        integrity: op.args.integrity,
        sourceName: op.args.sourceName,
        installedAt: new Date(),
        updatedAt: new Date(),
        resolvedSkills: op.args.resolvedSkills,
        resolvedCommands: op.args.resolvedCommands,
        resolvedMcpServers: op.args.resolvedMcpServers,
        resolvedSubagents: op.args.resolvedSubagents,
        versionConstraint: op.args.versionConstraint,
      })
      .pipe(
        Effect.catch((e) => renderer.warn(`Extension pack metadata update failed: ${String(e)}`)),
      );

    return {
      result: "success",
      message: `Installed extension pack ${op.args.packName}`,
    } satisfies JobStepResult;
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed({
        result: "error",
        message: `Failed to install extension pack: ${error.what}`,
        error,
      } satisfies JobStepResult),
    ),
  );
