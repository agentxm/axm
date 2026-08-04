/**
 * Uninstall command executor — orchestrates per-command removal pipeline.
 *
 * Pipeline: resolve desired/observed state -> remove rendered files from
 * agents -> remove canonical source -> clear settings and receipt.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { makeAppError, type AppError } from "../../app-error/index.js";
import type { JobStepResult, Operation } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { REGISTRY_EXTENSIONS_DIR, EXTERNAL_EXTENSIONS_DIR } from "../../extensions/index.js";
import { CodingAgentRepository } from "../../agents/index.js";
import { checkInstalledOnDisk } from "./shared-command-helpers.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the uninstall-command operation.
 */
export interface UninstallCommandOperationArgs {
  readonly commandName: string;
}

/**
 * Remove a command from the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type UninstallCommandOperation = Operation<
  "uninstall-command",
  UninstallCommandOperationArgs
>;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Uninstall-command operation handler.
 *
 * 1. Resolve configured and observed state
 * 2. Remove rendered files through configured agent adapters
 * 3. Remove canonical directory from disk (if exists)
 * 4. Remove settings and receipt
 */
export const uninstallCommand: (
  op: UninstallCommandOperation,
) => Effect.Effect<
  JobStepResult,
  AppError,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | CodingAgentRepository
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const agentRepo = yield* CodingAgentRepository;
    const base = ws.baseDir;

    const desired = yield* ws.getDesiredStateGraph();
    if (!desired.complete) {
      return yield* makeAppError({
        code: "conflict",
        detail: "Cannot uninstall the command while the desired extension graph is incomplete.",
        recover: "Repair or reinstall the configured packs, then retry.",
      });
    }
    const desiredNode = desired.nodes.find(
      (node) => node.type === "command" && node.name === op.args.commandName,
    );
    const installedOnDisk = yield* checkInstalledOnDisk(fs, path, base, op.args.commandName);

    if (desiredNode === undefined && !installedOnDisk) {
      return { result: "success", message: "not installed" } satisfies JobStepResult;
    }
    if (desiredNode?.origins.some((origin) => origin.type === "pack") === true) {
      yield* ws.removeCommandSettings(op.args.commandName);
      return {
        result: "success",
        message: "Kept on disk because dependency is still required by an installed pack",
      } satisfies JobStepResult;
    }

    // --- Remove rendered files from agents ---
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

    if (installedOnDisk) {
      yield* removeFromAllCommandLocations(fs, path, base, op.args.commandName);
    }

    // Remove from external extensions dir too
    const externalPath = path.join(base, EXTERNAL_EXTENSIONS_DIR, "commands", op.args.commandName);
    yield* fs.remove(externalPath, { recursive: true }).pipe(Effect.catch(() => Effect.void));

    // Remove from settings + lockfile. This is the authoritative state: if it
    // fails, surface the error instead of reporting a success that leaves the
    // command present in the lockfile/settings but gone from disk.
    yield* ws.removeCommand(op.args.commandName);

    return {
      result: "success",
      message: `Uninstalled ${op.args.commandName}`,
    } satisfies JobStepResult;
  });

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const removeFromAllCommandLocations = (
  fsService: FileSystem.FileSystem,
  pathService: Path.Path,
  base: string,
  commandName: string,
) =>
  Effect.gen(function* () {
    const extensionsDir = pathService.join(base, REGISTRY_EXTENSIONS_DIR);
    const extensionsDirExists = yield* fsService
      .exists(extensionsDir)
      .pipe(Effect.catch(() => Effect.succeed(false)));

    if (extensionsDirExists) {
      const scopeDirs = yield* fsService
        .readDirectory(extensionsDir)
        .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));

      yield* Effect.forEach(
        scopeDirs,
        (scopeDir) => {
          if (!scopeDir.startsWith("@")) return Effect.void;
          const cmdPath = pathService.join(extensionsDir, scopeDir, "commands", commandName);
          return fsService
            .remove(cmdPath, { recursive: true })
            .pipe(Effect.catch(() => Effect.void));
        },
        { concurrency: "unbounded" },
      );
    }

    // Also remove from external
    const externalPath = pathService.join(base, EXTERNAL_EXTENSIONS_DIR, "commands", commandName);
    yield* fsService
      .remove(externalPath, { recursive: true })
      .pipe(Effect.catch(() => Effect.void));
  });
