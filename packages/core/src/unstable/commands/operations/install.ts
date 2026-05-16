/**
 * Install command executor — orchestrates the per-command installation pipeline.
 *
 * Supports all ref types (registry, git-hosted, local). After materialization,
 * reads the command's content file (`${name}.md`) and `command.json`, renders
 * to all configured agents concurrently, and writes lockfile entries with
 * agents, sourceHash, and renderedFiles.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { CliRenderer } from "../../cli-renderer/index.js";
import {
  computeIntegrity,
  isPathSafe,
  makeWorkspaceRelativeSourcePath,
  stripFileProtocol,
} from "../../utils/index.js";
import { errInstallFailed, makeAppError, type AppError } from "../../app-error/index.js";
import { validateExactResolvedVersion } from "../../lockfile/index.js";
import { createRegistryClient, extractZip } from "../../registry/index.js";
import type { JobStepResult, Operation } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import {
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  computeSourceHash,
} from "../../extensions/index.js";
import { RenderedFilesMapSchema } from "../../extensions/rendered-files.js";
import { copyExtensionDirectory, validatePathSafety } from "../../extensions/utils.js";
import type {
  CommandExtensionRef,
  GitHostedCommandRef,
  LocalCommandRef,
  RegistryCommandRef,
} from "../refs.js";
import type { CommandLockEntry } from "../../lockfile/index.js";
import { CodingAgentRepository } from "../../agents/index.js";
import { buildLockEntryFromRef } from "../manager.js";
import { readCommandContent, renderToAgents } from "./shared-command-helpers.js";

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

const installFromRegistry = (ref: RegistryCommandRef) =>
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

    // Empty integrity with existing canonical → skip fetch (synthetic refs from publish)
    const canonicalExists = yield* fs.exists(canonicalPath).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to check if canonical path exists: ${canonicalPath}`,
          cause: e,
        }),
      ),
    );
    const useExisting = Option.isNone(ref.integrity) && canonicalExists;

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

// --- Materialization dispatcher ---
const materializeCommand = (ref: CommandExtensionRef) => {
  switch (ref.refType) {
    case "registry":
      return installFromRegistry(ref);
    case "git-hosted":
      return installFromGitHosted(ref);
    case "local":
      return installFromLocal(ref);
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
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | CliRenderer | CodingAgentRepository
> = (op) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const path = yield* Path.Path;
    const renderer = yield* CliRenderer;
    const { ref } = op.args;

    // --- Materialize ---
    const canonicalPath = yield* materializeCommand(ref);

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
      ref.refType === "registry"
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

    // --- Report lossy rendering warnings grouped by agent ---
    const warningsByAgent: Record<string, Array<string>> = Object.fromEntries(
      outcomes
        .map(({ agentId, outcome, warnings }) => {
          const agentWarnings: Array<string> = [
            ...(outcome._tag === "success" ? Array.from(outcome.warnings) : []),
            ...(outcome._tag === "conflict" ? [`conflict - ${outcome.reason}`] : []),
            ...warnings
              .filter((w) => w.feature && w.message)
              .map((w) => `${w.feature} - ${w.message}`),
          ];
          return [agentId, agentWarnings] as const;
        })
        .filter(([, ws]) => ws.length > 0),
    );

    const agentIds = Object.keys(warningsByAgent);
    if (agentIds.length > 0) {
      const grouped = agentIds
        .map((id) => {
          const agentWarnings = warningsByAgent[id] ?? [];
          return `  ${id}:\n${agentWarnings.map((w) => `    - ${w}`).join("\n")}`;
        })
        .join("\n");
      yield* renderer.warn(`Rendering warnings:\n${grouped}`);
    }

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
    const now = new Date();
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
      agents: successfulAgents,
      sourceHash,
      renderedFiles,
    };

    const writeEffect = Option.getOrElse(op.args.skipSettings, () => false)
      ? ws.setCommandLock({ name: ref.command.name, lockEntry })
      : ws.setCommand({ name: ref.command.name, lockEntry });
    const writeSucceeded = yield* writeEffect.pipe(
      Effect.as(true),
      Effect.tapError((e) => Effect.logWarning("Command write failed", { error: e })),
      Effect.catch((e) =>
        renderer.warn(`Command update failed (${e.code}): ${e.message}`).pipe(Effect.as(false)),
      ),
    );

    if (!writeSucceeded) {
      return {
        result: "error",
        message: `Installed ${ref.command.name} but failed to write workspace state`,
        error: makeAppError({
          code: "internal",
          detail: `Installed ${ref.command.name} but failed to persist lockfile/settings`,
          suggestions: [{ description: "Try running the install again" }],
        }),
      } satisfies JobStepResult;
    }

    return {
      result: "success",
      message: `Installed ${ref.command.name}`,
    } satisfies JobStepResult;
  });
