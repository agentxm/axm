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
import { makeWorkspaceRelativeSourcePath } from "../../utils/index.js";
import { makeAppError, type AppError } from "../../app-error/index.js";
import { validateExactResolvedVersion } from "../../lockfile/index.js";
import type { Operation, JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import {
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  computeSourceHash,
} from "../../extensions/index.js";
import { RenderedFilesMapSchema } from "../../extensions/rendered-files.js";
import {
  materializeExternalPackage,
  materializeRegistryPackage,
} from "../../extensions/materialization.js";
import type {
  CommandExtensionRef,
  GitHostedCommandRef,
  LocalCommandRef,
  RegistryCommandRef,
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

const installFromRegistry = (ref: RegistryCommandRef) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;

    const canonicalPath = path.join(
      ws.baseDir,
      REGISTRY_EXTENSIONS_DIR,
      ref.owner,
      "commands",
      ref.name,
    );

    return yield* materializeRegistryPackage({
      baseDir: ws.baseDir,
      canonicalPath,
      sourceLocation: ref.source.location,
      owner: ref.owner,
      type: "command",
      name: ref.name,
      version: ref.version,
      integrity: ref.integrity,
    });
  });

// --- Git-hosted install ---
const installFromGitHosted = (ref: GitHostedCommandRef) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;

    const canonicalPath = path.join(
      ws.baseDir,
      EXTERNAL_EXTENSIONS_DIR,
      "commands",
      ref.command.name,
    );
    return yield* materializeExternalPackage({
      baseDir: ws.baseDir,
      canonicalPath,
      sourceLocation: ref.location,
      packageLabel: "command",
    });
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
    return yield* materializeExternalPackage({
      baseDir: ws.baseDir,
      canonicalPath,
      sourceLocation: ref.location,
      packageLabel: "command",
    });
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
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | CodingAgentRepository
> = (op) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const path = yield* Path.Path;
    const { ref } = op.args;
    const previousLockEntry = yield* ws.getLockedCommand(ref.command.name);

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
    const artifact = commandInstallArtifact({
      lockEntry,
      previousLockEntry,
      versionRange: op.args.versionRange,
      canonicalPath,
      fallbackPath: ref.command.name,
      scope: ws.scope,
      workspaceRoot: ws.baseDir,
      pathService: path,
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
