/**
 * Publish skill executor — reads a managed extension's manifest, builds a zip
 * archive, computes the SRI integrity hash, and publishes to a target registry.
 *
 * Pipeline: validate manifest → build archive → compute integrity →
 * resolve registry provider → publish version (idempotent).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { REGISTRY_EXTENSIONS_DIR, parseFqn } from "../../extensions/index.js";
import { SkillManifestSchema, type SkillManifest, MANIFEST_FILENAME } from "../manifest-schema.js";
import type { VersionEntry } from "../../registry/index.js";
import { createRegistryClient } from "../../registry/index.js";
import { buildZipArchive, computeIntegrity } from "../../utils/index.js";
import { makeAppError } from "../../app-error/index.js";
import type { OperationHandler } from "../../workspace/apply-plan.js";
import type { Operation } from "../../workspace/plan.js";
import type { JobStepResult } from "../../workspace/plan.js";
import { Workspace } from "../../workspace/service-interface.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the publish-skill operation.
 *
 * Reads the manifest from `.axm/extensions/`, builds a zip archive,
 * computes the SRI integrity hash, and publishes to the target registry.
 */
export type PublishSkillOperationArgs = {
  /** Extension identity in `@owner/name` format. */
  readonly name: string;
  /** Named source to publish to (e.g. "local"). */
  readonly registryName: string;
};

/**
 * Publish a managed extension to a registry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PublishSkillOperation = Operation<"publish-skill", PublishSkillOperationArgs>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Publish-skill operation handler.
 *
 * 1. Read and validate `axm-skill.json` manifest
 * 2. Build zip archive of extension directory
 * 3. Compute SRI integrity hash
 * 4. Resolve target registry provider by source name
 * 5. Publish version (idempotent: same integrity = no-op, different integrity = error)
 */
export const publishSkill: OperationHandler<
  PublishSkillOperation,
  FileSystem.FileSystem | Path.Path | Workspace
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const base = ws.baseDir;

    const fqn = yield* parseFqn(op.args.name);

    // Locate the managed extension directory
    const extensionDir = path.join(base, REGISTRY_EXTENSIONS_DIR, fqn.owner, "skills", fqn.name);
    const extensionDirExists = yield* fs
      .exists(extensionDir)
      .pipe(Effect.orElseSucceed(() => false));
    if (!extensionDirExists) {
      return yield* makeAppError({
        code: "PUBLISH_SKILL_NOT_FOUND",
        what: `Managed extension not found: ${extensionDir}`,
      });
    }

    // Read and validate manifest
    const manifestPath = path.join(extensionDir, MANIFEST_FILENAME);
    const manifestContent = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PUBLISH_SKILL_MANIFEST_READ_FAILED",
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
          code: "PUBLISH_SKILL_MANIFEST_PARSE_FAILED",
          what: `Invalid JSON in manifest: ${manifestPath}`,
          cause: e,
        }),
    });

    const manifest: SkillManifest = yield* Schema.decodeUnknownEffect(SkillManifestSchema)(
      manifestJson,
    ).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PUBLISH_SKILL_MANIFEST_SCHEMA_INVALID",
          what: `Invalid manifest schema: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    // Build zip archive from extension directory (includes manifest + src/)
    const archive = yield* buildZipArchive(extensionDir, "PUBLISH_SKILL_ARCHIVE_FAILED");

    // Compute integrity
    const integrity = yield* computeIntegrity(archive);

    // Resolve target registry source
    const registrySource = yield* ws.getConfiguredSourceByName(op.args.registryName).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "PUBLISH_SKILL_REGISTRY_LOOKUP_FAILED",
          what: `Failed to lookup registry source "${op.args.registryName}"`,
          cause: e,
        }),
      ),
    );

    if (Option.isNone(registrySource)) {
      return yield* makeAppError({
        code: "PUBLISH_SKILL_REGISTRY_NOT_FOUND",
        what: `Registry source "${op.args.registryName}" not found or not a registry source`,
      });
    }

    const source = registrySource.value;
    if (source.type !== "registry") {
      return yield* makeAppError({
        code: "PUBLISH_SKILL_REGISTRY_NOT_FOUND",
        what: `Registry source "${op.args.registryName}" not found or not a registry source`,
      });
    }

    const registryUrl = source.location.href;

    const client = yield* createRegistryClient(registryUrl);

    // Build version entry metadata
    const versionEntry: VersionEntry = {
      version: manifest.version,
      published: new Date().toISOString(),
      integrity,
    };

    // Publish to registry (idempotent)
    yield* client
      .publishExtension({
        owner: fqn.owner,
        type: "skill",
        name: fqn.name,
        version: manifest.version,
        archive,
        metadata: versionEntry,
      })
      .pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "PUBLISH_SKILL_PUBLISH_FAILED",
            what: `Failed to publish to registry "${op.args.registryName}"`,
            details: [
              `Registry source: ${op.args.registryName}`,
              `Registry URL: ${registryUrl}`,
              `Extension: ${op.args.name}@${manifest.version}`,
              `Registry error: ${e.what} (${e.code})`,
              ...e.details,
            ],
            ...(Option.isSome(e.howToFix) && { howToFix: e.howToFix.value }),
            cause: e,
          }),
        ),
      );

    return {
      result: "success",
      message: `Published ${op.args.name}@${manifest.version}`,
    } satisfies JobStepResult;
  });
