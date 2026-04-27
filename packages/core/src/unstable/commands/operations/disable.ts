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
import type { AgentId } from "../../agents/types.js";
import { makeAppError } from "../../app-error/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation, JobStepResult } from "../../plan/plan.js";
import { Workspace } from "../../workspace/service-interface.js";
import { CodingAgentRepository } from "../../agents/index.js";

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
 * 1. Read rendered files from lockfile
 * 2. Remove rendered files from all agents (concurrent)
 * 3. Clear lockfile agents array (preserve materialised files)
 * 4. Update settings to set enabled: false
 *
 * Settings-only path (no lock entry):
 * 1. Update settings to set enabled: false
 */
export const disableCommand: OperationHandler<
  DisableCommandOperation,
  FileSystem.FileSystem | Path.Path | Workspace | CodingAgentRepository
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const ws = yield* Workspace;
    const agentRepo = yield* CodingAgentRepository;
    const base = ws.baseDir;

    // Check for lock entry
    const lockEntryOption = yield* ws.getLockedCommand(op.args.commandName).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "DISABLE_COMMAND_LOCKFILE_READ_FAILED",
          what: `Failed to read lockfile: ${e.what}`,
          cause: e,
        }),
      ),
    );

    // Lock-backed file operations (when lock entry exists)
    if (Option.isSome(lockEntryOption)) {
      const lockEntry = lockEntryOption.value;

      // Remove rendered files from agents
      if (lockEntry.renderedFiles) {
        yield* Effect.forEach(
          Object.entries(lockEntry.renderedFiles),
          ([_agentId, files]) =>
            Effect.forEach(
              files,
              (file) =>
                fs.remove(file.path, { recursive: true }).pipe(Effect.catch(() => Effect.void)),
              { concurrency: "unbounded" },
            ),
          { concurrency: "unbounded" },
        );
      } else if (lockEntry.agents.length > 0) {
        // Fallback: remove via agent removeCommand
        const configuredAgents = yield* agentRepo.getConfiguredAgents();

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

      // Clear lock agents and renderedFiles but preserve materialized files
      const now = new Date();
      const emptyAgents: ReadonlyArray<AgentId> = [];
      const updatedLockEntry = {
        ...lockEntry,
        agents: emptyAgents,
        renderedFiles: undefined,
        updatedAt: now,
      };
      yield* ws
        .setCommandLock({ name: op.args.commandName, lockEntry: updatedLockEntry })
        .pipe(Effect.catch(() => Effect.void));
    }

    // Update settings to mark as disabled
    // For configured commands: update existing entry
    // For implicit commands (lockfile-only): promote to direct entry
    const existingSettings = yield* ws
      .getConfiguredCommands()
      .pipe(Effect.catch(() => Effect.succeed({})));
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

    return {
      result: "success",
      message: `Disabled ${op.args.commandName}`,
    } satisfies JobStepResult;
  });
