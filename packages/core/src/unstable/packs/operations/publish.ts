/**
 * Publish extension pack executor -- reads a managed extension pack's manifest, builds a zip
 * archive, computes the SRI integrity hash, and publishes to a target registry.
 *
 * Pipeline: validate manifest -> build archive -> compute integrity ->
 * resolve registry provider -> publish version (idempotent).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { parseFqn, type ExtensionDependencyConstraintMap } from "../../extensions/index.js";
import {
  ExtensionPackManifestSchema,
  type ExtensionPackManifest,
  EXTENSION_PACK_MANIFEST_FILENAME,
} from "../manifest-schema.js";
import type { VersionEntry } from "../../registry/index.js";
import { createRegistryClient } from "../../registry/index.js";
import { buildZipArchive, computeIntegrity } from "../../utils/index.js";
import { makeAppError } from "../../app-error/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation, JobStepResult } from "../../plan/plan.js";
import { Workspace } from "../../workspace/service-interface.js";
import { computeExtensionPackPaths } from "../paths.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Args for the publish-pack operation.
 */
export interface PublishExtensionPackOperationArgs {
  /** Extension identity in `@owner/name` format. */
  readonly name: string;
  /** Named source to publish to (e.g., "local"). */
  readonly registryName: string;
}

/**
 * Publish an extension pack to a registry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PublishExtensionPackOperation = Operation<
  "publish-pack",
  PublishExtensionPackOperationArgs
>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Publish extension pack operation handler.
 *
 * 1. Read and validate `extension-pack.json` manifest
 * 2. Build zip archive of extension pack directory
 * 3. Compute SRI integrity hash
 * 4. Resolve target registry provider by source name
 * 5. Publish version (idempotent: same integrity = no-op, different integrity = error)
 */
export const publishExtensionPack: OperationHandler<
  PublishExtensionPackOperation,
  FileSystem.FileSystem | Path.Path | Workspace
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const base = ws.baseDir;

    const fqn = yield* parseFqn(op.args.name);

    // Locate the managed pack directory
    const packDir = computeExtensionPackPaths(path.join, base, fqn.owner, fqn.name).canonicalPath;
    const packDirExists = yield* fs.exists(packDir).pipe(Effect.orElseSucceed(() => false));
    if (!packDirExists) {
      return yield* makeAppError({
        code: "PUBLISH_PACK_NOT_FOUND",
        what: `Managed extension pack not found: ${packDir}`,
      });
    }

    // Read and validate manifest
    const manifestPath = path.join(packDir, EXTENSION_PACK_MANIFEST_FILENAME);
    const manifestContent = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PUBLISH_PACK_MANIFEST_READ_FAILED",
          what: `Failed to read manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    const manifestJson = yield* Effect.try({
      try: () => {
        const parsed: unknown = JSON.parse(manifestContent);
        return parsed;
      },
      catch: (e) =>
        makeAppError({
          code: "PUBLISH_PACK_MANIFEST_PARSE_FAILED",
          what: `Invalid JSON in manifest: ${manifestPath}`,
          cause: e,
        }),
    });

    const manifest: ExtensionPackManifest = yield* Schema.decodeUnknownEffect(
      ExtensionPackManifestSchema,
    )(manifestJson).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PUBLISH_PACK_MANIFEST_SCHEMA_INVALID",
          what: `Invalid manifest schema: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    // Build zip archive from pack directory
    const archive = yield* buildZipArchive(packDir, "PUBLISH_PACK_ARCHIVE_FAILED");

    // Compute integrity
    const integrity = yield* computeIntegrity(archive);

    // Resolve target registry source
    const registrySource = yield* ws.getConfiguredSourceByName(op.args.registryName).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PUBLISH_PACK_REGISTRY_LOOKUP_FAILED",
          what: `Failed to lookup registry source "${op.args.registryName}"`,
          cause: e,
        }),
      ),
    );

    if (Option.isNone(registrySource) || registrySource.value.type !== "registry") {
      return yield* makeAppError({
        code: "PUBLISH_PACK_REGISTRY_NOT_FOUND",
        what: `Registry source "${op.args.registryName}" not found or not a registry source`,
      });
    }

    const client = yield* createRegistryClient(registrySource.value.location.href);

    // Collect manifest dependencies (keys are already 3-segment FQNs)
    const dependencies: Record<string, ExtensionDependencyConstraintMap[string]> = {};
    const addDependencies = (candidates: ExtensionDependencyConstraintMap | undefined) => {
      if (candidates === undefined) {
        return;
      }
      for (const fqn of Object.keys(candidates)) {
        const constraint = candidates[fqn];
        if (constraint !== undefined) {
          dependencies[fqn] = constraint;
        }
      }
    };

    addDependencies(manifest.skills);
    addDependencies(manifest.commands);
    addDependencies(manifest["mcp-servers"]);
    addDependencies(manifest.subagents);

    // Build version entry metadata
    const versionEntry: VersionEntry = {
      version: manifest.version,
      published: new Date().toISOString(),
      integrity,
      ...(Object.keys(dependencies).length > 0 && { dependencies }),
    };

    // Publish to registry (idempotent)
    yield* client
      .publishExtension({
        owner: fqn.owner,
        type: "pack",
        name: fqn.name,
        version: manifest.version,
        archive,
        metadata: versionEntry,
      })
      .pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "PUBLISH_PACK_PUBLISH_FAILED",
            what: "Failed to publish to registry",
            details: [e.what],
            cause: e,
          }),
        ),
      );

    return {
      result: "success",
      message: `Published ${op.args.name}@${manifest.version}`,
    } satisfies JobStepResult;
  });
