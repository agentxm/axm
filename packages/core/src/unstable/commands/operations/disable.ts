/**
 * Disable command executor — removes rendered files from agents but preserves
 * materialized files in .axm/extensions/.
 *
 * Two paths:
 * - Lock entry present: full disable (remove rendered files + clear lock agents + settings)
 * - No lock entry: settings-only toggle
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import { makeAppError } from "../../app-error/index.js";
import type { CommandLockEntry } from "../../lockfile/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { JobStepArtifact, Operation, JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { CodingAgentRepository } from "../../agents/index.js";
import { configuredRowsByName } from "../../workspace/read-model-record-rows.js";

const commandVersion = (entry: CommandLockEntry): string | undefined =>
  entry.type === "registry" ? entry.resolvedVersion : undefined;

const commandDisableArtifact = (
  lockEntry: CommandLockEntry,
  scope: JobStepArtifact["scope"],
  agents: ReadonlyArray<string>,
): JobStepArtifact => {
  const version = commandVersion(lockEntry);

  return {
    path: ".axm/settings.json",
    scope,
    ...(agents.length === 0 ? {} : { agents }),
    ...(version === undefined ? {} : { version }),
    change: "updated",
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
 * Disable a command (remove rendered files but keep settings/lockfile entry).
 *
 * @experimental This API is unstable and may change without notice.
 */
export type DisableCommandOperation = Operation<
  "disable-command",
  { readonly commandName: string }
>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Disable-command operation handler.
 *
 * Lock-backed path:
 * 1. Resolve the configured materialization agents
 * 2. Remove rendered files through each agent adapter (concurrent)
 * 3. Update settings to set enabled: false
 *
 * Settings-only path (no lock entry):
 * 1. Update settings to set enabled: false
 */
export const disableCommand: OperationHandler<
  DisableCommandOperation,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | CodingAgentRepository
> = (op) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const agentRepo = yield* CodingAgentRepository;
    const base = ws.baseDir;
    const configuredAgents = yield* agentRepo.getConfiguredAgents();

    // Check for lock entry
    const lockEntryOption = yield* ws.getLockedCommand(op.args.commandName).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read lockfile: ${e.message}`,
          cause: e,
        }),
      ),
    );

    // Lock-backed file operations (when lock entry exists)
    if (Option.isSome(lockEntryOption)) {
      yield* Effect.forEach(
        configuredAgents,
        (agent) =>
          agent
            .removeCommand({
              workspaceRoot: base,
              scope: "project",
              commandName: op.args.commandName,
            })
            .pipe(Effect.catch(() => Effect.void)),
        { concurrency: "unbounded" },
      );
    }

    // Update settings to mark as disabled
    // For configured commands: update existing entry
    // For implicit commands (lockfile-only): promote to direct entry
    const existingSettings = yield* ws.records.rows("command").pipe(
      Effect.map(configuredRowsByName),
      Effect.catch(() => Effect.succeed({})),
    );
    if (op.args.commandName in existingSettings) {
      yield* ws
        .updateCommandEntry(op.args.commandName, (entry) => ({
          ...entry,
          enabled: false,
        }))
        .pipe(Effect.catch(() => Effect.void));
    } else if (Option.isSome(lockEntryOption)) {
      // Implicit command: promote to direct settings entry with disabled state
      const lockEntry = lockEntryOption.value;
      const source =
        lockEntry.type === "registry"
          ? `${lockEntry.owner}/commands/${lockEntry.name}`
          : lockEntry.type === "local"
            ? lockEntry.path
            : "";
      yield* ws
        .setCommandEntry(op.args.commandName, { source, enabled: false })
        .pipe(Effect.catch(() => Effect.void));
    }

    const artifact = Option.match(lockEntryOption, {
      onNone: () => settingsOnlyCommandArtifact(ws.scope),
      onSome: (lockEntry) =>
        commandDisableArtifact(
          lockEntry,
          ws.scope,
          configuredAgents.map((agent) => agent.id),
        ),
    });

    return {
      result: "success",
      message: `Disabled ${op.args.commandName}`,
      artifact,
    } satisfies JobStepResult;
  });
