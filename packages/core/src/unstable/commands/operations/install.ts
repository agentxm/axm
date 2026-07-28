/**
 * Install command executor — orchestrates the per-command installation pipeline.
 *
 * Supports all ref types (registry, git-hosted, local). After materialization,
 * reads the command's content file (`${name}.md`) and `command.json`, renders
 * to all configured agents concurrently, and writes shared source resolution
 * and content hashes to the lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import {
  computeIntegrity,
  isPathSafe,
  makeWorkspaceRelativeSourcePath,
  stripFileProtocol,
} from "../../utils/index.js";
import { errInstallFailed, makeAppError, type AppError } from "../../app-error/index.js";
import { validateExactResolvedVersion } from "../../lockfile/index.js";
import { createRegistryClient, extractZip } from "../../registry/index.js";
import type { Operation, JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import {
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  computeSourceHash,
  shouldReuseCanonicalInstall,
} from "../../extensions/index.js";
import { RenderedFilesMapSchema } from "../../extensions/rendered-files.js";
import { copyExtensionDirectory, validatePathSafety } from "../../extensions/utils.js";
import type {
  CommandExtensionRef,
  GitHostedCommandRef,
  LocalCommandRef,
  RegistryCommandRef,
  WorkspaceCommandRef,
} from "../refs.js";
import type { CommandLockEntry } from "../../lockfile/index.js";
import { CodingAgentRepository } from "../../agents/index.js";
import { commandInstallArtifact } from "../install-artifact.js";
import { buildLockEntryFromRef } from "../manager.js";
import {
  collectRenderingWarningSummaries,
  readCommandContent,
  renderToAgents,
} from "./shared-command-helpers.js";

const decodeRenderedFilesMap = Schema.decodeUnknownSync(RenderedFilesMapSchema);

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the install-command operation.
 */
export type InstallCommandOperationArgs = {
  readonly ref: CommandExtensionRef;
  readonly force: boolean;
  readonly versionRange: Option.Option<string>;
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
// Registry install
// -----------------------------------------------------------------------------

const installFromRegistry = (
  ref: RegistryCommandRef,
  reuse: { readonly force: boolean; readonly lockedVersion: string | undefined },
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;

    const canonicalPath = path.join(
      ws.baseDir,
      REGISTRY_EXTENSIONS_DIR,
      ref.owner,
      "commands",
      ref.name,
    );

    if (!isPathSafe(ws.baseDir, canonicalPath)) {
      return yield* makeAppError({
        code: "internal",
        detail: `Path traversal detected: ${canonicalPath}`,
      });
    }

    const canonicalExists = yield* fs.exists(canonicalPath).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to check if canonical path exists: ${canonicalPath}`,
          cause: e,
        }),
      ),
    );
    const useExisting = shouldReuseCanonicalInstall({
      canonicalExists,
      force: reuse.force,
      hasIntegrity: Option.isSome(ref.integrity),
      refVersion: ref.version,
      lockedVersion: reuse.lockedVersion,
    });

    if (!useExisting) {
      const locationStr =
        ref.source.location.protocol === "file:"
          ? ref.source.location.pathname
          : ref.source.location.href;
      const client = yield* createRegistryClient(locationStr);
      const { archive } = yield* client.getExtensionPackage({
        owner: ref.owner,
        type: "command",
        name: ref.name,
        version: Option.some(ref.version),
      });

      if (Option.isSome(ref.integrity)) {
        const actualIntegrity = yield* computeIntegrity(archive);
        if (actualIntegrity !== ref.integrity.value) {
          return yield* makeAppError({
            code: "internal",
            detail: `Integrity mismatch for ${ref.name}@${ref.version}`,
          });
        }
      }

      const tmpDir = yield* fs.makeTempDirectory().pipe(
        Effect.mapError((e) =>
          errInstallFailed({
            message: "Temporary directory for registry install could not be created",
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
              errInstallFailed({
                message: `Failed to create canonical directory: ${canonicalPath}`,
                cause: e,
              }),
            ),
          );
          // Copy extracted files to canonical
          const entries = yield* fs.readDirectory(tmpDir).pipe(
            Effect.mapError((e) =>
              errInstallFailed({
                message: "Extracted directory could not be read",
                cause: e,
              }),
            ),
          );
          yield* Effect.forEach(
            entries,
            (entry) => {
              const src = path.join(tmpDir, entry);
              const dest = path.join(canonicalPath, entry);
              return fs.copy(src, dest).pipe(
                Effect.mapError((e) =>
                  errInstallFailed({
                    message: `Failed to copy installed file: ${entry}`,
                    cause: e,
                  }),
                ),
              );
            },
            { concurrency: "unbounded" },
          );
        }),
        fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore),
      );
    }

    return canonicalPath;
  });

// --- Git-hosted install ---
const installFromGitHosted = (ref: GitHostedCommandRef) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;

    const canonicalPath = path.join(
      ws.baseDir,
      EXTERNAL_EXTENSIONS_DIR,
      "commands",
      ref.command.name,
    );
    yield* validatePathSafety(ws.baseDir, canonicalPath);

    const sourcePath = stripFileProtocol(ref.location);
    yield* fs.remove(canonicalPath, { recursive: true }).pipe(Effect.ignore);
    yield* copyExtensionDirectory(sourcePath, canonicalPath).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "validation",
          detail: `Failed to copy command files to ${canonicalPath}`,
          cause: e,
        }),
      ),
    );

    return canonicalPath;
  });

// --- Local install ---
const installFromLocal = (ref: LocalCommandRef) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;

    const canonicalPath = path.join(
      ws.baseDir,
      EXTERNAL_EXTENSIONS_DIR,
      "commands",
      ref.command.name,
    );
    yield* validatePathSafety(ws.baseDir, canonicalPath);

    const sourcePath = stripFileProtocol(ref.location);
    const isSelfCopy = path.resolve(sourcePath) === path.resolve(canonicalPath);
    if (!isSelfCopy) {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.remove(canonicalPath, { recursive: true }).pipe(Effect.ignore);
      yield* copyExtensionDirectory(sourcePath, canonicalPath).pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "validation",
            detail: `Failed to copy command files to ${canonicalPath}`,
            cause: e,
          }),
        ),
      );
    }

    return canonicalPath;
  });

const installFromWorkspace = (ref: WorkspaceCommandRef) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const expectedPath = path.join(
      ws.baseDir,
      REGISTRY_EXTENSIONS_DIR,
      ref.owner,
      "commands",
      ref.name,
    );
    if (ref.scope !== ws.scope || path.resolve(ref.location) !== path.resolve(expectedPath)) {
      return yield* makeAppError({
        code: "validation",
        detail: `Invalid workspace command source location: ${ref.location}`,
      });
    }
    const exists = yield* fs.exists(ref.location).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to inspect workspace command package: ${ref.location}`,
          cause: error,
        }),
      ),
    );
    if (!exists) {
      return yield* makeAppError({
        code: "validation",
        detail: `Workspace command package is missing: ${ref.location}`,
      });
    }
    return ref.location;
  });

// --- Materialization dispatcher ---
const materializeCommand = (
  ref: CommandExtensionRef,
  reuse: { readonly force: boolean; readonly lockedVersion: string | undefined },
) => {
  switch (ref.refType) {
    case "registry":
      return installFromRegistry(ref, reuse);
    case "git-hosted":
      return installFromGitHosted(ref);
    case "local":
      return installFromLocal(ref);
    case "workspace":
      return installFromWorkspace(ref);
  }
};

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Install-command operation handler.
 *
 * Supports all ref types: registry, git-hosted, local.
 * After materialization:
 * 1. Reads the command's `${name}.md` content file and `command.json`
 * 2. Renders to all configured agents concurrently
 * 3. Writes lockfile entries with agents, sourceHash, renderedFiles
 */
export const installCommand: (
  op: InstallCommandOperation,
) => Effect.Effect<
  JobStepResult,
  AppError,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | CodingAgentRepository
> = (op) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const path = yield* Path.Path;
    const { ref } = op.args;
    const previousLockEntry = yield* ws.getLockedCommand(ref.command.name);
    const lockedVersion = Option.match(previousLockEntry, {
      onNone: () => undefined,
      onSome: (entry) => (entry.type === "registry" ? entry.resolvedVersion : undefined),
    });

    // --- Materialize ---
    const canonicalPath = yield* materializeCommand(ref, {
      force: op.args.force,
      lockedVersion,
    });

    // --- Read command content ---
    const { frontmatter, agentOverrides, body, manifest, contentPath } = yield* readCommandContent(
      canonicalPath,
      ref.command.name,
      "INSTALL_COMMAND",
    );
    const editSourcePath = makeWorkspaceRelativeSourcePath(path, ws.baseDir, contentPath);
    if (Option.isNone(editSourcePath)) {
      return yield* makeAppError({
        code: "internal",
        detail: `Command source path escapes workspace root: ${contentPath}`,
      });
    }

    // --- Resolve owner: registry refs supply it; otherwise read from settings ---
    const owner =
      ref.refType === "registry" || ref.refType === "workspace"
        ? ref.owner
        : yield* ws.getConfiguredOwner().pipe(
            Effect.flatMap(
              Option.match({
                onNone: () =>
                  Effect.fail(
                    makeAppError({
                      code: "internal",
                      detail: `Cannot install non-registry command "${ref.command.name}" without a configured owner`,
                      suggestions: [
                        {
                          description:
                            "Set `owner` in `.axm/settings.json` (project or global) before installing non-registry commands.",
                        },
                      ],
                    }),
                  ),
                onSome: Effect.succeed,
              }),
            ),
          );

    // --- Render to agents concurrently ---
    const { outcomes, successfulAgents, rawRenderedFiles } = yield* renderToAgents({
      commandName: ref.command.name,
      editSourcePath: editSourcePath.value,
      frontmatter,
      agentOverrides: Option.getOrUndefined(agentOverrides),
      body,
      manifest,
      owner,
      workspaceRoot: ws.baseDir,
      force: op.args.force,
    });

    const renderingWarnings = collectRenderingWarningSummaries(outcomes);

    // --- Compute source hash ---
    const sourceHash = computeSourceHash(body);

    // --- Validate version before building lock entry (registry only) ---
    if (ref.refType === "registry") {
      yield* validateExactResolvedVersion(
        `commands.${ref.command.name}.resolvedVersion`,
        ref.version,
      );
    }

    // --- Build lock entry with agents, sourceHash, renderedFiles ---
    const now = yield* DateTime.now;
    const workspaceRelativeLocalSourcePath =
      ref.refType === "local"
        ? makeWorkspaceRelativeSourcePath(path, ws.baseDir, ref.source.path)
        : Option.none();
    if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
      return yield* makeAppError({
        code: "validation",
        detail: `Local command source path must stay within the workspace root: ${ref.source.path}`,
      });
    }
    const baseLockEntry = buildLockEntryFromRef(ref, now, workspaceRelativeLocalSourcePath);

    const renderedFiles = decodeRenderedFilesMap(rawRenderedFiles);

    const lockEntry: CommandLockEntry = {
      ...baseLockEntry,
      sourceHash,
    };
    const artifact = commandInstallArtifact({
      lockEntry,
      previousLockEntry,
      versionRange: op.args.versionRange,
      canonicalPath,
      fallbackPath: ref.command.name,
      scope: ws.scope,
      workspaceRoot: ws.baseDir,
      pathService: path,
      agents: successfulAgents,
      renderedFiles,
    });

    if (artifact.change === "unchanged") {
      return {
        result: "success",
        message: `${ref.command.name} already up to date`,
        artifact,
      } satisfies JobStepResult;
    }

    const writeEffect = Option.getOrElse(op.args.skipSettings, () => false)
      ? ws.setCommandLock({ name: ref.command.name, lockEntry })
      : ws.setCommand({ name: ref.command.name, lockEntry });
    const writeSucceeded = yield* writeEffect.pipe(
      Effect.as(true),
      Effect.tapError((e) => Effect.logWarning("Command write failed", { error: e })),
      Effect.catch(() => Effect.succeed(false)),
    );

    if (!writeSucceeded) {
      return {
        result: "error",
        message: `Installed ${ref.command.name} but failed to write workspace state`,
        error: makeAppError({
          code: "internal",
          detail: `Installed ${ref.command.name} but failed to persist lockfile/settings`,
          suggestions: [{ description: "Retry the install." }],
        }),
      } satisfies JobStepResult;
    }

    return {
      result: "success",
      message:
        renderingWarnings.length === 0
          ? `Installed ${ref.command.name}`
          : `Installed ${ref.command.name}; Rendering warnings: ${renderingWarnings.join("; ")}`,
      ...(renderingWarnings.length === 0 ? {} : { warnings: renderingWarnings }),
      artifact,
    } satisfies JobStepResult;
  });
