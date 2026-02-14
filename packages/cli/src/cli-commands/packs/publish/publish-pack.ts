/**
 * Publish pack executor -- reads a managed pack's manifest, builds a zip
 * archive, computes the SHA-256 checksum, and publishes to a target registry.
 *
 * Pipeline: validate manifest -> build archive -> compute checksum ->
 * resolve registry provider -> publish version (idempotent).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  PackManifestSchema,
  type PackManifest,
} from "../../../extensions/packs/manifest-schema.js";
import type { VersionEntry } from "../../../registry/index.js";
import { createRegistryProvider } from "../../../sources/providers/registry.js";
import { computeChecksum } from "../../../utils/checksum.js";
import { makeCliError } from "../../../cli-error/index.js";
import type { OperationHandler } from "../../../workspace/apply-plan.js";
import type { OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service.js";
import { REGISTRY_EXTENSIONS_DIR } from "../../skills/constants.js";
import { parseScopedName } from "../../skills/naming.js";
import type { PublishPackOperation } from "../operations.js";

// Re-export for convenience
export type { PublishPackOperation } from "../operations.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const PACK_MANIFEST_FILENAME = "axm-pack.json";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Build a zip archive of a directory.
 * Files are stored at the root of the zip (no enclosing directory).
 */
const buildZipArchive = (dir: string) =>
  Effect.tryPromise({
    try: async () => {
      const { execFileSync } = await import("node:child_process");
      const { readFile, mkdtemp, rm } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const p = await import("node:path");

      const tmpDir = await mkdtemp(p.join(tmpdir(), "axm-publish-"));
      const archivePath = p.join(tmpDir, "archive.zip");

      // Create deterministic zip (strip extra attributes, normalize timestamps)
      execFileSync("find", [dir, "-exec", "touch", "-t", "202001010000.00", "{}", "+"]);
      execFileSync("zip", ["-r", "-q", "-X", "-D", archivePath, "."], {
        cwd: dir,
        stdio: "pipe",
      });

      const bytes = await readFile(archivePath);
      await rm(tmpDir, { recursive: true, force: true });

      return new Uint8Array(bytes);
    },
    catch: (e) =>
      makeCliError({
        code: "PUBLISH_PACK_ARCHIVE_FAILED",
        what: "Failed to build zip archive",
        cause: e,
      }),
  });

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Publish-pack operation handler.
 *
 * 1. Read and validate `axm-pack.json` manifest
 * 2. Build zip archive of pack directory
 * 3. Compute SHA-256 checksum
 * 4. Resolve target registry provider by source name
 * 5. Publish version (idempotent: same checksum = no-op, different checksum = error)
 */
export const publishPack: OperationHandler<
  PublishPackOperation,
  FileSystem.FileSystem | Path.Path | Workspace
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const base = path.dirname(ws.path);

    const { scope, skillName: shortName } = parseScopedName(op.args.name);

    // Locate the managed pack directory
    const packDir = path.join(base, REGISTRY_EXTENSIONS_DIR, scope, "packs", shortName);
    const packDirExists = yield* fs.exists(packDir).pipe(Effect.orElseSucceed(() => false));
    if (!packDirExists) {
      return yield* makeCliError({
        code: "PUBLISH_PACK_NOT_FOUND",
        what: `Managed pack not found: ${packDir}`,
      });
    }

    // Read and validate manifest
    const manifestPath = path.join(packDir, PACK_MANIFEST_FILENAME);
    const manifestContent = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "PUBLISH_PACK_MANIFEST_READ_FAILED",
          what: `Failed to read manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    const manifestJson = yield* Effect.try({
      try: () => JSON.parse(manifestContent) as unknown,
      catch: (e) =>
        makeCliError({
          code: "PUBLISH_PACK_MANIFEST_PARSE_FAILED",
          what: `Invalid JSON in manifest: ${manifestPath}`,
          cause: e,
        }),
    });

    const manifest: PackManifest = yield* Schema.decodeUnknown(PackManifestSchema)(
      manifestJson,
    ).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "PUBLISH_PACK_MANIFEST_SCHEMA_INVALID",
          what: `Invalid manifest schema: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    // Build zip archive from pack directory
    const archive = yield* buildZipArchive(packDir);

    // Compute checksum
    const checksum = yield* computeChecksum(archive);

    // Resolve target registry source
    const registrySource = yield* ws.getConfiguredSourceByName(op.args.registryName).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "PUBLISH_PACK_REGISTRY_LOOKUP_FAILED",
          what: `Failed to lookup registry source "${op.args.registryName}"`,
          cause: e,
        }),
      ),
    );

    if (Option.isNone(registrySource) || registrySource.value.type !== "registry") {
      return yield* makeCliError({
        code: "PUBLISH_PACK_REGISTRY_NOT_FOUND",
        what: `Registry source "${op.args.registryName}" not found or not a registry source`,
      });
    }

    const provider = createRegistryProvider(registrySource.value.url.href);

    // Build version entry metadata
    const versionEntry: VersionEntry = {
      version: manifest.version,
      published: new Date().toISOString(),
      agents: [],
      checksum,
    };

    // Publish to registry (idempotent)
    yield* provider
      .publishVersion(scope, "pack", shortName, manifest.version, archive, versionEntry)
      .pipe(
        Effect.mapError((e) =>
          makeCliError({
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
    } satisfies OperationResult;
  });
