/**
 * Publish extension executor -- reads a managed extension's manifest, builds a
 * zip archive, computes the SRI integrity hash, and publishes to a target
 * registry.
 *
 * Generic handler that works for any non-pack extension type (skill, command,
 * mcp-server). The manifest filename and schema are derived from the extension
 * type.
 *
 * Pipeline: validate manifest -> build archive -> compute integrity ->
 * resolve registry provider -> publish version (idempotent).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { SkillManifestSchema, type SkillManifest } from "../../skills/manifest-schema.js";
import { CommandManifestSchema, type CommandManifest } from "../../commands/manifest-schema.js";
import {
  McpServerManifestSchema,
  type McpServerManifest,
} from "../../mcp-servers/manifest-schema.js";
import type { VersionEntry } from "../../../registry/index.js";
import { createRegistryClient } from "../../../registry/index.js";
import { computeIntegrity } from "../../../utils/integrity.js";
import { buildZipArchive } from "../../../utils/build-zip-archive.js";
import { makeCliError } from "../../../cli-error/index.js";
import type { OperationHandler } from "../../../workspace/apply-plan.js";
import type { Operation, OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service.js";
import { parseFqn } from "../../fqn.js";
import { REGISTRY_EXTENSIONS_DIR } from "../../constants.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Args for the publish-extension operation.
 */
export interface PublishExtensionOperationArgs {
  /** Extension identity in `@scope/type/name` FQN format. */
  readonly name: string;
  /** Extension type (singular). */
  readonly type: "skill" | "command" | "mcp-server";
  /** Named source to publish to (e.g., "local"). */
  readonly registryName: string;
}

/**
 * Publish any non-pack extension to a registry.
 *
 * Generic operation that works for skills, commands, and MCP servers.
 * The publish flow is identical: read manifest, zip, compute integrity, publish.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PublishExtensionOperation = Operation<
  "publish-extension",
  PublishExtensionOperationArgs
>;

// -----------------------------------------------------------------------------
// Manifest config per extension type
// -----------------------------------------------------------------------------

type ExtensionManifest = SkillManifest | CommandManifest | McpServerManifest;

const MANIFEST_CONFIG = {
  skill: {
    filename: "axm-skill.json",
    schema: SkillManifestSchema,
  },
  command: {
    filename: "axm-command.json",
    schema: CommandManifestSchema,
  },
  "mcp-server": {
    filename: "axm-mcp-server.json",
    schema: McpServerManifestSchema,
  },
} as const;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Publish-extension operation handler.
 *
 * 1. Read and validate type-specific manifest
 * 2. Build zip archive of extension directory
 * 3. Compute SRI integrity hash
 * 4. Resolve target registry provider by source name
 * 5. Publish version (idempotent: same integrity = no-op, different integrity = error)
 */
export const publishExtension: OperationHandler<
  PublishExtensionOperation,
  FileSystem.FileSystem | Path.Path | Workspace
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const base = ws.baseDir;

    const fqn = yield* parseFqn(op.args.name);
    const config = MANIFEST_CONFIG[op.args.type];

    // Locate the managed extension directory
    const extensionDir = path.join(base, REGISTRY_EXTENSIONS_DIR, fqn.scope, fqn.type, fqn.name);
    const extensionDirExists = yield* fs
      .exists(extensionDir)
      .pipe(Effect.orElseSucceed(() => false));
    if (!extensionDirExists) {
      return yield* makeCliError({
        code: "PUBLISH_EXTENSION_NOT_FOUND",
        what: `Managed extension not found: ${extensionDir}`,
      });
    }

    // Read and validate manifest
    const manifestPath = path.join(extensionDir, config.filename);
    const manifestContent = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "PUBLISH_EXTENSION_MANIFEST_READ_FAILED",
          what: `Failed to read manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    const manifestJson = yield* Effect.try({
      try: () => JSON.parse(manifestContent) as unknown,
      catch: (e) =>
        makeCliError({
          code: "PUBLISH_EXTENSION_MANIFEST_PARSE_FAILED",
          what: `Invalid JSON in manifest: ${manifestPath}`,
          cause: e,
        }),
    });

    const manifest: ExtensionManifest = yield* Schema.decodeUnknown(config.schema)(
      manifestJson,
    ).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "PUBLISH_EXTENSION_MANIFEST_SCHEMA_INVALID",
          what: `Invalid manifest schema: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    // Build zip archive from extension directory
    const archive = yield* buildZipArchive(extensionDir, "PUBLISH_EXTENSION_ARCHIVE_FAILED");

    // Compute integrity
    const integrity = yield* computeIntegrity(archive);

    // Resolve target registry source
    const registrySource = yield* ws.getConfiguredSourceByName(op.args.registryName).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "PUBLISH_EXTENSION_REGISTRY_LOOKUP_FAILED",
          what: `Failed to lookup registry source "${op.args.registryName}"`,
          cause: e,
        }),
      ),
    );

    if (Option.isNone(registrySource) || registrySource.value.type !== "registry") {
      return yield* makeCliError({
        code: "PUBLISH_EXTENSION_REGISTRY_NOT_FOUND",
        what: `Registry source "${op.args.registryName}" not found or not a registry source`,
      });
    }

    const client = yield* createRegistryClient(registrySource.value.location.href);

    // Build version entry metadata
    const dependencies =
      "dependencies" in manifest && manifest.dependencies
        ? { dependencies: { ...manifest.dependencies } }
        : {};

    const versionEntry: VersionEntry = {
      version: manifest.version,
      published: new Date().toISOString(),
      integrity,
      ...dependencies,
    };

    // Publish to registry (idempotent)
    yield* client
      .publishExtension({
        scope: fqn.scope,
        type: op.args.type,
        name: fqn.name,
        version: manifest.version,
        archive,
        metadata: versionEntry,
      })
      .pipe(
        Effect.mapError((e) =>
          makeCliError({
            code: "PUBLISH_EXTENSION_PUBLISH_FAILED",
            what: "Failed to publish to registry",
            details: [e.what],
            cause: e,
          }),
        ),
      );

    return {
      result: "success",
      message: `Published ${op.args.name}@${manifest.version}`,
    } satisfies OperationResult;
  });
