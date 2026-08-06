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
import { makeAppError } from "../../app-error/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { JobStepArtifact, Operation, JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { CodingAgentRepository } from "../../agents/index.js";
import { configuredRowsByName } from "../../workspace/read-model-record-rows.js";

const commandDisableArtifact = (
  scope: JobStepArtifact["scope"],
  agents: ReadonlyArray<string>,
): JobStepArtifact => {
  return {
    path: ".axm/settings.json",
    scope,
    ...(agents.length === 0 ? {} : { agents }),
    change: "updated",
  };
};

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
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const agentRepo = yield* CodingAgentRepository;
    const base = ws.baseDir;
    const configuredAgents = yield* agentRepo.getConfiguredAgents();

    const desired = yield* ws.getDesiredStateGraph();
    if (!desired.complete) {
      return yield* makeAppError({
        code: "conflict",
        detail: "Cannot disable the command while pack-derived desired state is unresolved.",
      });
    }
    const desiredNodeBeforeDisable = desired.nodes.find(
      (node) => node.type === "command" && node.name === op.args.commandName,
    );

    // Update settings to mark as disabled
    // For configured commands: update existing entry
    // For implicit commands (lockfile-only): promote to direct entry
    const existingSettings = yield* ws.records.rows("command").pipe(
      Effect.map(configuredRowsByName),
      Effect.catch(() => Effect.succeed({})),
    );
    yield* ws.runTransaction({
      transition: Effect.gen(function* () {
        if (op.args.commandName in existingSettings) {
          yield* ws.updateCommandEntry(op.args.commandName, (entry) => ({
            ...entry,
            enabled: false,
          }));
        } else if (desiredNodeBeforeDisable !== undefined) {
          yield* ws.setCommandEntry(op.args.commandName, {
            source: desiredNodeBeforeDisable.source,
            enabled: false,
          });
        }

        const outcomes = yield* Effect.forEach(
          configuredAgents,
          (agent) =>
            agent.removeCommand({
              workspaceRoot: base,
              scope: ws.scope,
              commandName: op.args.commandName,
            }),
          { concurrency: "unbounded" },
        );
        const conflicts = outcomes.flatMap((outcome, index) =>
          outcome._tag === "conflict"
            ? [`${configuredAgents[index]?.id ?? "unknown"}: ${outcome.reason}`]
            : [],
        );
        if (conflicts.length > 0) {
          return yield* makeAppError({
            code: "conflict",
            detail: `Command removal failed for ${op.args.commandName}: ${conflicts.join(", ")}`,
          });
        }
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      ),
      validate: () => Effect.void,
    });

    const artifact = commandDisableArtifact(
      ws.scope,
      configuredAgents.map((agent) => agent.id),
    );

    return {
      result: "success",
      message: `Disabled ${op.args.commandName}`,
      artifact,
    } satisfies JobStepResult;
  });
