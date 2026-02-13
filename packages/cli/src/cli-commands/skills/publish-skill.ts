/**
 * Publish skill executor — reads a managed extension's manifest, builds a zip
 * archive, computes the SHA-256 checksum, and publishes to a target registry.
 *
 * Pipeline: validate manifest → build archive → compute checksum →
 * resolve registry provider → publish version (idempotent).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  SkillManifestSchema,
  type SkillManifest,
} from "../../extensions/skills/manifest-schema.js";
import type { VersionEntry } from "../../registry/index.js";
import { createRegistryProvider } from "../../sources/providers/registry.js";
import { computeChecksum } from "../../utils/checksum.js";
import { makeCliError } from "../../cli-error/index.js";
import type { OperationHandler } from "../../workspace/apply-plan.js";
import type { OperationResult } from "../../workspace/plan.js";
import { Workspace } from "../../workspace/service.js";
import type { PublishSkillOperation } from "./operations.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const REGISTRY_EXTENSIONS_DIR = ".axm/extensions";
const MANIFEST_FILENAME = "axm-skill.json";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Parse `@scope/name` into its parts.
 */
const parseExtensionName = (
  name: string,
): { readonly scope: string; readonly skillName: string } => {
  const slashIdx = name.indexOf("/");
  return {
    scope: name.slice(0, slashIdx),
    skillName: name.slice(slashIdx + 1),
  };
};

/**
 * Build a zip archive of a directory.
 * Files are stored at the root of the zip (no enclosing directory).
 */
const buildZipArchive = (dir: string) =>
  Effect.tryPromise({
    try: async () => {
      const { execSync } = await import("node:child_process");
      const { readFile, mkdtemp } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const p = await import("node:path");

      const tmpDir = await mkdtemp(p.join(tmpdir(), "axm-publish-"));
      const archivePath = p.join(tmpDir, "archive.zip");

      // Create deterministic zip (strip extra attributes, normalize timestamps)
      // -X strips extra file attributes, -D disables directory entries
      // find + touch normalizes file timestamps for reproducible archives
      execSync(
        `find "${dir}" -exec touch -t 202001010000.00 {} + && cd "${dir}" && zip -r -q -X -D "${archivePath}" .`,
        { stdio: "pipe" },
      );

      const bytes = await readFile(archivePath);
      // Clean up temp file
      const { rm } = await import("node:fs/promises");
      await rm(tmpDir, { recursive: true, force: true });

      return new Uint8Array(bytes);
    },
    catch: (e) =>
      makeCliError({
        code: "PUBLISH_SKILL_ARCHIVE_FAILED",
        what: "Failed to build zip archive",
        cause: e,
      }),
  });

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Publish-skill operation handler.
 *
 * 1. Read and validate `axm-skill.json` manifest
 * 2. Build zip archive of extension directory
 * 3. Compute SHA-256 checksum
 * 4. Resolve target registry provider by source name
 * 5. Publish version (idempotent: same checksum = no-op, different checksum = error)
 */
export const publishSkill: OperationHandler<
  PublishSkillOperation,
  FileSystem.FileSystem | Path.Path | Workspace
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const base = path.dirname(ws.path);

    const { scope, skillName } = parseExtensionName(op.args.name);

    // Locate the managed extension directory
    const extensionDir = path.join(base, REGISTRY_EXTENSIONS_DIR, scope, "skills", skillName);
    const extensionDirExists = yield* fs
      .exists(extensionDir)
      .pipe(Effect.orElseSucceed(() => false));
    if (!extensionDirExists) {
      return yield* makeCliError({
        code: "PUBLISH_SKILL_NOT_FOUND",
        what: `Managed extension not found: ${extensionDir}`,
      });
    }

    // Read and validate manifest
    const manifestPath = path.join(extensionDir, MANIFEST_FILENAME);
    const manifestContent = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "PUBLISH_SKILL_MANIFEST_READ_FAILED",
          what: `Failed to read manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    const manifestJson = yield* Effect.try({
      try: () => JSON.parse(manifestContent) as unknown,
      catch: (e) =>
        makeCliError({
          code: "PUBLISH_SKILL_MANIFEST_PARSE_FAILED",
          what: `Invalid JSON in manifest: ${manifestPath}`,
          cause: e,
        }),
    });

    const manifest: SkillManifest = yield* Schema.decodeUnknown(SkillManifestSchema)(
      manifestJson,
    ).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "PUBLISH_SKILL_MANIFEST_SCHEMA_INVALID",
          what: `Invalid manifest schema: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    // Build zip archive from extension directory (includes manifest + src/)
    const archive = yield* buildZipArchive(extensionDir);

    // Compute checksum
    const checksum = yield* computeChecksum(archive);

    // Resolve target registry source
    const registrySource = yield* ws.getConfiguredSourceByName(op.args.registryName).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "PUBLISH_SKILL_REGISTRY_LOOKUP_FAILED",
          what: `Failed to lookup registry source "${op.args.registryName}"`,
          cause: e,
        }),
      ),
    );

    if (Option.isNone(registrySource) || registrySource.value.type !== "registry") {
      return yield* makeCliError({
        code: "PUBLISH_SKILL_REGISTRY_NOT_FOUND",
        what: `Registry source "${op.args.registryName}" not found or not a registry source`,
      });
    }

    const provider = createRegistryProvider(registrySource.value.url.href);

    // Build version entry metadata
    const versionEntry: VersionEntry = {
      version: manifest.version,
      published: new Date().toISOString(),
      agents: manifest.agents ? [...manifest.agents] : [],
      checksum,
      ...(manifest.dependencies ? { dependencies: { ...manifest.dependencies } } : {}),
    };

    // Publish to registry (idempotent)
    yield* provider
      .publishVersion(scope, "skill", skillName, manifest.version, archive, versionEntry)
      .pipe(
        Effect.mapError((e) =>
          makeCliError({
            code: "PUBLISH_SKILL_PUBLISH_FAILED",
            what: e.what,
            cause: e.cause,
          }),
        ),
      );

    return {
      result: "success",
      message: `Published ${op.args.name}@${manifest.version}`,
    } satisfies OperationResult;
  });
