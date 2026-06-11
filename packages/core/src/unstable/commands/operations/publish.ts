/**
 * Publish command executor — reads a command's manifest, builds a zip
 * archive, computes the SRI integrity hash, and publishes to a target registry.
 *
 * Pipeline: validate manifest -> build archive -> compute integrity ->
 * resolve registry provider -> publish version (idempotent).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  REGISTRY_EXTENSIONS_DIR,
  parseFqn,
  fqnInvalidErrorToAppError,
} from "../../extensions/index.js";
import {
  COMMAND_MANIFEST_FILENAME,
  CommandManifestSchema,
  type CommandManifest,
} from "../manifest-schema.js";
import type { VersionEntry } from "../../registry/index.js";
import { createRegistryClient } from "../../registry/index.js";
import { buildZipArchive, computeIntegrity } from "../../utils/index.js";
import { makeAppError, type AppError } from "../../app-error/index.js";
import type { JobStepArtifact, JobStepResult, Operation } from "../../plan/plan.js";
import {
  validateCommandManifestHasNoAgentOverridesField,
  validateManifestHasNoAgentsField,
} from "../../publish/manifest-policy.js";
import { runPublishLintGate } from "../../publish/lint-gate.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the publish-command operation.
 */
export type PublishCommandOperationArgs = {
  /** Extension identity in `@owner/commands/name` FQN format. */
  readonly name: string;
  /** Named source to publish to (e.g. "local"). */
  readonly registryName: string;
};

/**
 * Publish a command extension to a registry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PublishCommandOperation = Operation<"publish-command", PublishCommandOperationArgs>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

const publishArtifact = (args: {
  readonly path: string;
  readonly scope: JobStepArtifact["scope"];
  readonly version: string;
}): JobStepArtifact => ({
  path: args.path,
  scope: args.scope,
  version: args.version,
  change: "created",
  targets: [{ path: args.path, change: "created" }],
});

/**
 * Publish-command operation handler.
 *
 * 1. Read and validate `command.json` manifest
 * 2. Build zip archive of extension directory
 * 3. Compute SRI integrity hash
 * 4. Resolve target registry provider by source name
 * 5. Publish version (idempotent: same integrity = no-op, different integrity = error)
 */
export const publishCommand: (
  op: PublishCommandOperation,
) => Effect.Effect<
  JobStepResult,
  AppError,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const base = ws.baseDir;

    const fqn = yield* Result.mapError(parseFqn(op.args.name), fqnInvalidErrorToAppError);

    // Locate the extension directory
    const extensionDir = path.join(base, REGISTRY_EXTENSIONS_DIR, fqn.owner, "commands", fqn.name);
    const extensionDirExists = yield* fs
      .exists(extensionDir)
      .pipe(Effect.orElseSucceed(() => false));
    if (!extensionDirExists) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Managed extension not found: ${extensionDir}`,
      });
    }

    // Read and validate manifest
    const manifestPath = path.join(extensionDir, COMMAND_MANIFEST_FILENAME);
    const manifestContent = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read manifest: ${manifestPath}`,
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
          code: "validation",
          detail: `Invalid JSON in manifest: ${manifestPath}`,
          cause: e,
        }),
    });

    const agentsFieldValidation = validateManifestHasNoAgentsField(
      COMMAND_MANIFEST_FILENAME,
      manifestJson,
    );
    if (Result.isFailure(agentsFieldValidation)) {
      return yield* makeAppError({
        code: "validation",
        detail: agentsFieldValidation.failure.detail,
      });
    }
    const agentOverridesFieldValidation = validateCommandManifestHasNoAgentOverridesField(
      COMMAND_MANIFEST_FILENAME,
      manifestJson,
    );
    if (Result.isFailure(agentOverridesFieldValidation)) {
      return yield* makeAppError({
        code: "validation",
        detail: agentOverridesFieldValidation.failure.detail,
      });
    }

    const manifest: CommandManifest = yield* Schema.decodeUnknownEffect(CommandManifestSchema)(
      manifestJson,
    ).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "validation",
          detail: `Invalid manifest schema: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    yield* runPublishLintGate({
      type: "command",
      extensionDir,
      manifestJson,
      platform: { fs, path },
    });

    // Build zip archive from extension directory
    const archive = yield* buildZipArchive(extensionDir);

    // Compute integrity
    const integrity = yield* computeIntegrity(archive);

    // Resolve target registry source
    const registrySource = yield* ws.getConfiguredSourceByName(op.args.registryName).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to lookup registry source "${op.args.registryName}"`,
          cause: e,
        }),
      ),
    );

    if (Option.isNone(registrySource) || registrySource.value.type !== "registry") {
      return yield* makeAppError({
        code: "not_found",
        detail: `Registry source "${op.args.registryName}" not found or not a registry source`,
      });
    }

    const client = yield* createRegistryClient(registrySource.value.location.href);

    // Build version entry metadata
    const versionEntry: VersionEntry = {
      version: manifest.version,
      published: new Date().toISOString(),
      integrity,
      ...(manifest.packages !== undefined && {
        packages: manifest.packages,
      }),
    };

    // Publish to registry (idempotent)
    const response = yield* client.publishExtension({
      owner: fqn.owner,
      type: "command",
      name: fqn.name,
      version: manifest.version,
      archive,
      metadata: versionEntry,
    });
    const publishedPath = response.links?.html ?? `${op.args.name}@${manifest.version}`;

    return {
      result: "success",
      message: `Published ${op.args.name}@${manifest.version}`,
      artifact: publishArtifact({
        path: publishedPath,
        scope: ws.scope,
        version: manifest.version,
      }),
      ...(response.links !== undefined ? { links: response.links } : {}),
    } satisfies JobStepResult;
  });
