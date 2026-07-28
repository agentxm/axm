/**
 * Publish subagent executor -- reads a managed subagent's manifest, builds a zip
 * archive, computes the SRI integrity hash, and publishes to a target registry.
 *
 * Pipeline: validate manifest -> build archive -> compute integrity ->
 * resolve registry provider -> publish immutable version.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  REGISTRY_EXTENSIONS_DIR,
  parseFqn,
  fqnInvalidErrorToAppError,
} from "../../extensions/index.js";
import {
  SubagentManifestSchema,
  type SubagentManifest,
  MANIFEST_FILENAME,
} from "../manifest-schema.js";
import type { VersionEntry } from "../../registry/index.js";
import { createRegistryClient } from "../../registry/index.js";
import { buildZipArchive, computeIntegrity } from "../../utils/index.js";
import { makeAppError } from "../../app-error/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { validateManifestHasNoAgentsField } from "../../publish/manifest-policy.js";
import { runPublishLintGate } from "../../publish/lint-gate.js";
import { parseSubagentMd } from "../subagent-content.js";
import { subagentContentFilename, subagentContentPath } from "../paths.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the publish-subagent operation.
 *
 * Reads the manifest from `.axm/extensions/`, builds a zip archive,
 * computes the SRI integrity hash, and publishes to the target registry.
 */
export type PublishSubagentOperationArgs = {
  /** Extension identity in `@owner/subagents/name` format. */
  readonly name: string;
  /** Named source to publish to (e.g. "local"). */
  readonly registryName: string;
};

/**
 * Publish a managed subagent to a registry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PublishSubagentOperation = Operation<"publish-subagent", PublishSubagentOperationArgs>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Publish-subagent operation handler.
 *
 * 1. Read and validate `subagent.json` manifest
 * 2. Validate the content file exists and its frontmatter `name` matches the manifest
 * 3. Build zip archive of extension directory
 * 4. Compute SRI integrity hash
 * 5. Resolve target registry provider by source name
 * 6. Publish immutable version (duplicate versions conflict)
 */
export const publishSubagent: OperationHandler<
  PublishSubagentOperation,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const base = ws.baseDir;

    const fqn = yield* Effect.fromResult(
      Result.mapError(parseFqn(op.args.name), fqnInvalidErrorToAppError),
    );

    // Locate the managed extension directory
    const extensionDir = path.join(base, REGISTRY_EXTENSIONS_DIR, fqn.owner, "subagents", fqn.name);
    const extensionDirExists = yield* fs
      .exists(extensionDir)
      .pipe(Effect.orElseSucceed(() => false));
    if (!extensionDirExists) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Managed subagent not found: ${extensionDir}`,
      });
    }

    // Read and validate manifest
    const manifestPath = path.join(extensionDir, MANIFEST_FILENAME);
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

    const agentsFieldValidation = validateManifestHasNoAgentsField(MANIFEST_FILENAME, manifestJson);
    if (Result.isFailure(agentsFieldValidation)) {
      return yield* makeAppError({
        code: "validation",
        detail: agentsFieldValidation.failure.detail,
      });
    }

    const manifest: SubagentManifest = yield* Schema.decodeUnknownEffect(SubagentManifestSchema)(
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
      type: "subagent",
      extensionDir,
      manifestJson,
      platform: { fs, path },
    });

    // Validate that the content file exists at the expected path and that its
    // frontmatter `name` matches the manifest. The manifest is the source of
    // truth for portable fields; this check just guards against drift.
    const contentRoot = path.join(extensionDir, "src");
    const expectedFilename = subagentContentFilename(manifest.name);
    const contentPath = subagentContentPath(path.join, contentRoot, manifest.name);
    const contentExists = yield* fs.exists(contentPath).pipe(Effect.orElseSucceed(() => false));

    if (!contentExists) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Missing subagent content file: expected ${expectedFilename}`,
        suggestions: [
          {
            description: `Rename the subagent content file to ${expectedFilename} and ensure its frontmatter name is ${manifest.name}.`,
          },
        ],
      });
    }

    const rawContent = yield* fs.readFileString(contentPath).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read ${expectedFilename}: ${contentPath}`,
          cause: e,
        }),
      ),
    );
    yield* parseSubagentMd(rawContent, manifest.name);

    // Build zip archive from extension directory (includes manifest + src/)
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

    if (Option.isNone(registrySource)) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Registry source "${op.args.registryName}" not found or not a registry source`,
      });
    }

    const source = registrySource.value;
    if (source.type !== "registry") {
      return yield* makeAppError({
        code: "not_found",
        detail: `Registry source "${op.args.registryName}" not found or not a registry source`,
      });
    }

    const registryUrl = source.location.href;

    const client = yield* createRegistryClient(registryUrl);

    // Build version entry metadata
    const versionEntry: VersionEntry = {
      version: manifest.version,
      published: yield* DateTime.now,
      integrity,
      ...(manifest.packages !== undefined && {
        packages: manifest.packages,
      }),
    };

    // Publish immutable version to registry.
    const response = yield* client.publishExtension({
      owner: fqn.owner,
      type: "subagent",
      name: fqn.name,
      version: manifest.version,
      archive,
      metadata: versionEntry,
    });

    return {
      result: "success",
      message: `Published ${op.args.name}@${manifest.version}`,
      ...(response.links !== undefined ? { links: response.links } : {}),
    } satisfies JobStepResult;
  });
