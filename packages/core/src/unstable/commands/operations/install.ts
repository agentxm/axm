/**
 * Install command executor — orchestrates the per-command installation pipeline.
 *
 * Registry-only install: fetch archive, extract to canonical path, update lockfile/settings.
 * Simpler than skills — no agent symlinks.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { CliRenderer } from "../../cli-renderer/index.js";
import { computeIntegrity, isPathSafe } from "../../utils/index.js";
import { makeAppError } from "../../app-error/index.js";
import { validateExactResolvedVersion } from "../../lockfile/index.js";
import { createRegistryClient, extractZip } from "../../registry/index.js";
import type { OperationHandler } from "../../workspace/apply-plan.js";
import type { Operation, OperationResult } from "../../workspace/plan.js";
import { Workspace } from "../../workspace/service-interface.js";
import { REGISTRY_EXTENSIONS_DIR } from "../../extensions/index.js";
import type { CommandExtensionRef, RegistryCommandRef } from "../../extensions/index.js";
import type { CommandLockEntry } from "../../lockfile/index.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the install-command operation.
 */
export type InstallCommandOperationArgs = {
  readonly ref: CommandExtensionRef;
  readonly force: boolean;
  readonly versionConstraint: Option.Option<string>;
  /** When true, write to lockfile only (skip settings). Used for pack dependencies. */
  readonly skipSettings: Option.Option<boolean>;
};

/**
 * Add a command to the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type InstallCommandOperation = Operation<"install-command", InstallCommandOperationArgs>;

// -----------------------------------------------------------------------------
// Lock entry builder
// -----------------------------------------------------------------------------

const buildLockEntry = (ref: RegistryCommandRef, now: Date): CommandLockEntry => ({
  type: "registry",
  profile: ref.profile,
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

const installFromRegistry = (ref: RegistryCommandRef) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;

    const canonicalPath = path.join(
      ws.baseDir,
      REGISTRY_EXTENSIONS_DIR,
      ref.profile,
      "commands",
      ref.name,
    );

    if (!isPathSafe(ws.baseDir, canonicalPath)) {
      return yield* makeAppError({
        code: "INSTALL_COMMAND_PATH_TRAVERSAL",
        what: `Path traversal detected: ${canonicalPath}`,
      });
    }

    // Empty integrity with existing canonical → skip fetch (synthetic refs from fork/publish)
    const canonicalExists = yield* fs.exists(canonicalPath).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "INSTALL_COMMAND_PATH_CHECK_FAILED",
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
        handle: ref.profile,
        type: "command",
        name: ref.name,
        version: Option.some(ref.version),
      });

      // Non-empty integrity → validate
      if (ref.integrity !== "") {
        const actualIntegrity = yield* computeIntegrity(archive);
        if (actualIntegrity !== ref.integrity) {
          return yield* makeAppError({
            code: "INSTALL_COMMAND_INTEGRITY_MISMATCH",
            what: `Integrity mismatch for ${ref.name}@${ref.version}`,
            details: [`Expected ${ref.integrity}, got ${actualIntegrity}`],
          });
        }
      }

      const tmpDir = yield* fs.makeTempDirectory().pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "INSTALL_COMMAND_TEMP_DIR_FAILED",
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
              makeAppError({
                code: "INSTALL_COMMAND_COPY_FAILED",
                what: `Failed to create canonical directory: ${canonicalPath}`,
                cause: e,
              }),
            ),
          );
          // Copy extracted files to canonical
          const entries = yield* fs.readDirectory(tmpDir).pipe(
            Effect.mapError((e) =>
              makeAppError({
                code: "INSTALL_COMMAND_COPY_FAILED",
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
 * Install-command operation handler.
 *
 * Registry-only: fetch archive, validate integrity, extract to canonical path,
 * then update lockfile/settings.
 */
export const installCommand: OperationHandler<
  InstallCommandOperation,
  FileSystem.FileSystem | Path.Path | Workspace | CliRenderer
> = (op) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const renderer = yield* CliRenderer;
    const { ref } = op.args;

    if (ref.refType !== "registry") {
      return yield* makeAppError({
        code: "INSTALL_COMMAND_UNSUPPORTED_REF_TYPE",
        what: `Unsupported ref type for command install: ${ref.refType}`,
      });
    }

    yield* installFromRegistry(ref);

    yield* validateExactResolvedVersion(
      `commands.${ref.command.name}.resolvedVersion`,
      ref.version,
    );

    // Build lock entry and persist
    const lockEntry = buildLockEntry(ref, new Date());
    const writeEffect = Option.getOrElse(op.args.skipSettings, () => false)
      ? ws.setCommandLock({ name: ref.command.name, lockEntry })
      : ws.setCommand({ name: ref.command.name, lockEntry });
    yield* writeEffect.pipe(
      Effect.catch((e) => renderer.warn(`Command update failed: ${String(e)}`)),
    );

    return {
      result: "success",
      message: `Installed ${ref.command.name}`,
    } satisfies OperationResult;
  });
