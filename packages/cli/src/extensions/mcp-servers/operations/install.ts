/**
 * Install MCP server executor — orchestrates the per-server installation pipeline.
 *
 * Registry-only install: fetch archive, extract to canonical path, update lockfile/settings.
 * Simpler than skills — no agent symlinks.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Log } from "../../../tui/index.js";
import { computeIntegrity } from "../../../utils/integrity.js";
import { makeCliError } from "../../../cli-error/index.js";
import { createRegistryClient, extractZip } from "../../../registry/index.js";
import type { OperationHandler } from "../../../workspace/apply-plan.js";
import type { Operation, OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/service.js";
import { REGISTRY_EXTENSIONS_DIR } from "../../constants.js";
import type { McpServerExtensionRef, RegistryMcpServerRef } from "../../../sources/types.js";
import type { McpServerLockEntry } from "../../../lockfile/schema.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the install-mcp-server operation.
 */
export type InstallMcpServerOperationArgs = {
  readonly ref: McpServerExtensionRef;
  readonly force: boolean;
  readonly versionConstraint: Option.Option<string>;
  /** When true, write to lockfile only (skip settings). Used for pack dependencies. */
  readonly skipSettings: Option.Option<boolean>;
};

/**
 * Add an MCP server to the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type InstallMcpServerOperation = Operation<
  "install-mcp-server",
  InstallMcpServerOperationArgs
>;

// -----------------------------------------------------------------------------
// Lock entry builder
// -----------------------------------------------------------------------------

const buildLockEntry = (ref: RegistryMcpServerRef, now: Date): McpServerLockEntry => ({
  type: "registry",
  namespace: ref.namespace,
  name: ref.name,
  resolvedVersion: ref.version,
  integrity: ref.integrity,
  sourceName: "default",
  installedAt: now,
  updatedAt: now,
});

// -----------------------------------------------------------------------------
// Registry install
// -----------------------------------------------------------------------------

const installFromRegistry = (ref: RegistryMcpServerRef) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;

    const canonicalPath = path.join(
      ws.baseDir,
      REGISTRY_EXTENSIONS_DIR,
      ref.namespace,
      "mcp-servers",
      ref.name,
    );

    // Empty integrity with existing canonical → skip fetch (synthetic refs from fork/publish)
    const canonicalExists = yield* fs.exists(canonicalPath).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "INSTALL_MCP_SERVER_PATH_CHECK_FAILED",
          what: `Failed to check if canonical path exists: ${canonicalPath}`,
          cause: e,
        }),
      ),
    );
    const useExisting = ref.integrity === "" && canonicalExists;

    if (!useExisting) {
      const locationStr =
        ref.source.location.protocol === "file:"
          ? ref.source.location.pathname
          : ref.source.location.href;
      const client = yield* createRegistryClient(locationStr);
      const { archive } = yield* client.getExtensionPackage({
        namespace: ref.namespace,
        type: "mcp-server",
        name: ref.name,
        version: Option.some(ref.version),
      });

      // Non-empty integrity → validate
      if (ref.integrity !== "") {
        const actualIntegrity = yield* computeIntegrity(archive);
        if (actualIntegrity !== ref.integrity) {
          return yield* makeCliError({
            code: "INSTALL_MCP_SERVER_INTEGRITY_MISMATCH",
            what: `Integrity mismatch for ${ref.name}@${ref.version}`,
            details: [`Expected ${ref.integrity}, got ${actualIntegrity}`],
          });
        }
      }

      const tmpDir = yield* fs.makeTempDirectory().pipe(
        Effect.mapError((e) =>
          makeCliError({
            code: "INSTALL_MCP_SERVER_TEMP_DIR_FAILED",
            what: `Failed to create temporary directory for registry install`,
            cause: e,
          }),
        ),
      );
      yield* Effect.ensuring(
        Effect.gen(function* () {
          yield* extractZip(archive, tmpDir);
          // Remove existing canonical and copy fresh
          yield* fs.remove(canonicalPath, { recursive: true }).pipe(Effect.ignore);
          yield* fs.makeDirectory(canonicalPath, { recursive: true }).pipe(
            Effect.mapError((e) =>
              makeCliError({
                code: "INSTALL_MCP_SERVER_COPY_FAILED",
                what: `Failed to create canonical directory: ${canonicalPath}`,
                cause: e,
              }),
            ),
          );
          // Copy extracted files to canonical
          const entries = yield* fs.readDirectory(tmpDir).pipe(
            Effect.mapError((e) =>
              makeCliError({
                code: "INSTALL_MCP_SERVER_COPY_FAILED",
                what: `Failed to read extracted directory`,
                cause: e,
              }),
            ),
          );
          yield* Effect.forEach(
            entries,
            (entry) => {
              const src = path.join(tmpDir, entry);
              const dest = path.join(canonicalPath, entry);
              return fs.copy(src, dest).pipe(Effect.ignore);
            },
            { concurrency: "unbounded" },
          );
        }),
        fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore),
      );
    }

    return canonicalPath;
  });

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Install-mcp-server operation handler.
 *
 * Registry-only: fetch archive, validate integrity, extract to canonical path,
 * then update lockfile/settings.
 */
export const installMcpServer: OperationHandler<
  InstallMcpServerOperation,
  FileSystem.FileSystem | Path.Path | Workspace | Log
> = (op) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const log = yield* Log;
    const { ref } = op.args;

    if (ref.refType !== "registry") {
      return yield* makeCliError({
        code: "INSTALL_MCP_SERVER_UNSUPPORTED_REF_TYPE",
        what: `Unsupported ref type for MCP server install: ${ref.refType}`,
      });
    }

    yield* installFromRegistry(ref);

    // Build lock entry and persist
    const lockEntry = buildLockEntry(ref, new Date());
    const writeEffect = Option.getOrElse(op.args.skipSettings, () => false)
      ? ws.setMcpServerLock({ name: ref.server.name, lockEntry })
      : ws.setMcpServer({ name: ref.server.name, lockEntry });
    yield* writeEffect.pipe(
      Effect.catchAll((e) => log.warn(`MCP server update failed: ${String(e)}`)),
    );

    return {
      result: "success",
      message: `Installed ${ref.server.name}`,
    } satisfies OperationResult;
  });
