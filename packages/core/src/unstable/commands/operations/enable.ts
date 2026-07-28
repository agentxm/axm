/**
 * Enable command executor — re-renders command to agents for a previously disabled command.
 *
 * Two paths:
 * - Lock entry present: full enable (re-render to agents + update lock + settings)
 * - No lock entry: settings-only toggle (configured command with no lock backing)
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import { makeAppError } from "../../app-error/index.js";
import type { CommandLockEntry } from "../../lockfile/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type {
  JobStepArtifact,
  JobStepArtifactTarget,
  Operation,
  JobStepResult,
} from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { canonicalExtensionPathForLockEntry, computeSourceHash } from "../../extensions/index.js";
import { RenderedFilesMapSchema } from "../../extensions/rendered-files.js";
import type { RenderedFilesMap } from "../../extensions/rendered-files.js";
import { CodingAgentRepository } from "../../agents/index.js";
import { makeWorkspaceRelativeSourcePath } from "../../utils/path-types.js";
import {
  collectRenderingWarningSummaries,
  readCommandContent,
  renderToAgents,
} from "./shared-command-helpers.js";

const decodeRenderedFilesMap = Schema.decodeUnknownSync(RenderedFilesMapSchema);

const commandVersion = (entry: CommandLockEntry): string | undefined =>
  entry.type === "registry" ? entry.resolvedVersion : undefined;

const renderedFileTargets = (
  renderedFiles: RenderedFilesMap,
): ReadonlyArray<JobStepArtifactTarget> => {
  if (renderedFiles === undefined) return [];

  const agentIdsByPath = new Map<string, Array<string>>();
  for (const [agentId, files] of Object.entries(renderedFiles)) {
    for (const file of files) {
      const agentIds = agentIdsByPath.get(file.path) ?? [];
      if (!agentIds.includes(agentId)) {
        agentIds.push(agentId);
      }
      agentIdsByPath.set(file.path, agentIds);
    }
  }

  return Array.from(agentIdsByPath.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([targetPath, agentIds]): JobStepArtifactTarget => ({
      path: targetPath,
      change: "updated",
      agentIds: [...agentIds].sort(),
    }));
};

const commandArtifactFromLockEntry = (
  lockEntry: CommandLockEntry,
  scope: JobStepArtifact["scope"],
  agents: ReadonlyArray<string>,
  renderedFiles: RenderedFilesMap,
): JobStepArtifact => {
  const targets = renderedFileTargets(renderedFiles);
  const firstTarget = targets[0];
  const version = commandVersion(lockEntry);

  return {
    path: firstTarget?.path ?? ".axm/settings.json",
    scope,
    ...(agents.length === 0 ? {} : { agents }),
    ...(version === undefined ? {} : { version }),
    change: "updated",
    ...(targets.length === 0 ? {} : { fileCount: targets.length, targets }),
  };
};

const settingsOnlyCommandArtifact = (scope: JobStepArtifact["scope"]): JobStepArtifact => ({
  path: ".axm/settings.json",
  scope,
  change: "updated",
});

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Enable a previously disabled command (re-render files and update state).
 *
 * @experimental This API is unstable and may change without notice.
 */
export type EnableCommandOperation = Operation<"enable-command", { readonly commandName: string }>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Enable-command operation handler.
 *
 * Lock-backed path:
 * 1. Read lock entry, determine canonical path
 * 2. Verify canonical directory exists
 * 3. Read the command's `${name}.md` content file and `command.json`
 * 4. Render to all configured agents concurrently
 * 5. Update the shared source hash in the lock entry
 * 6. Update settings entry to set enabled: true
 *
 * Settings-only path (no lock entry):
 * 1. Update settings entry to set enabled: true
 */
export const enableCommand: OperationHandler<
  EnableCommandOperation,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | CodingAgentRepository
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const base = ws.baseDir;

    // Check for lock entry to determine path
    const lockEntryOption = yield* ws.getLockedCommand(op.args.commandName).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read lockfile: ${e.message}`,
          cause: e,
        }),
      ),
    );

    // Settings-only path: no lock entry, just toggle enabled flag
    if (Option.isNone(lockEntryOption)) {
      yield* ws
        .updateCommandEntry(op.args.commandName, (entry) => ({
          ...entry,
          enabled: true,
        }))
        .pipe(Effect.catch(() => Effect.void));

      return {
        result: "success",
        message: `Enabled ${op.args.commandName}`,
        artifact: settingsOnlyCommandArtifact(ws.scope),
      } satisfies JobStepResult;
    }

    // Lock-backed path: full enable with re-rendering
    const lockEntry = lockEntryOption.value;

    const canonicalPath = canonicalExtensionPathForLockEntry(
      path,
      base,
      "commands",
      op.args.commandName,
      lockEntry,
    );

    const exists = yield* fs.exists(canonicalPath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Command files for "${op.args.commandName}" not found at ${canonicalPath}`,
        suggestions: [
          {
            description: "Try reinstalling the command.",
            cmd: "axm commands install <source>",
          },
        ],
      });
    }

    // Read the command content file and command.json
    const { frontmatter, agentOverrides, body, manifest, contentPath } = yield* readCommandContent(
      canonicalPath,
      op.args.commandName,
      "ENABLE_COMMAND",
    );
    const editSourcePath = makeWorkspaceRelativeSourcePath(path, base, contentPath);
    if (Option.isNone(editSourcePath)) {
      return yield* makeAppError({
        code: "internal",
        detail: `Command source path escapes workspace root: ${contentPath}`,
      });
    }

    // Resolve owner: registry lock entries supply it; otherwise read from settings
    const owner =
      lockEntry.type === "registry" || lockEntry.type === "workspace"
        ? lockEntry.owner
        : yield* ws.getConfiguredOwner().pipe(
            Effect.flatMap(
              Option.match({
                onNone: () =>
                  Effect.fail(
                    makeAppError({
                      code: "internal",
                      detail: `Cannot re-render non-registry command "${op.args.commandName}" without a configured owner`,
                      suggestions: [
                        {
                          description:
                            "Set `owner` in `.axm/settings.json` (project or global) to enable non-registry commands.",
                        },
                      ],
                    }),
                  ),
                onSome: Effect.succeed,
              }),
            ),
          );

    // Render to agents concurrently
    const { outcomes, successfulAgents, rawRenderedFiles } = yield* renderToAgents({
      commandName: op.args.commandName,
      editSourcePath: editSourcePath.value,
      frontmatter,
      agentOverrides: Option.getOrUndefined(agentOverrides),
      body,
      manifest,
      owner,
      workspaceRoot: base,
      force: false,
    });
    const renderingWarnings = collectRenderingWarningSummaries(outcomes);

    // Persist only shared source state. Agent and render state is derived from
    // settings and the workspace filesystem.
    const now = yield* DateTime.now;
    const sourceHash = computeSourceHash(body);
    const renderedFiles = decodeRenderedFilesMap(rawRenderedFiles);
    const updatedLockEntry = {
      ...lockEntry,
      sourceHash,
      updatedAt: now,
    };
    // Update lockfile only (preserve existing settings source)
    yield* ws
      .setCommandLock({ name: op.args.commandName, lockEntry: updatedLockEntry })
      .pipe(Effect.catch(() => Effect.void));

    // Update settings entry to enabled (collapsed to string form)
    yield* ws
      .updateCommandEntry(op.args.commandName, (entry) => ({
        ...entry,
        enabled: true,
      }))
      .pipe(Effect.catch(() => Effect.void));

    return {
      result: "success",
      message: `Enabled ${op.args.commandName}`,
      ...(renderingWarnings.length === 0 ? {} : { warnings: renderingWarnings }),
      artifact: commandArtifactFromLockEntry(
        updatedLockEntry,
        ws.scope,
        successfulAgents,
        renderedFiles,
      ),
    } satisfies JobStepResult;
  });
