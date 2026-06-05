/**
 * Command uninstall workflow actions service.
 *
 * Implements UninstallExtensionCommandWorkflowActions for commands.
 * The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { AppError } from "@agentxm/client-core/unstable/app-error";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { resolveInstalledIdentifierNameOrInput } from "@agentxm/client-core/unstable/source-resolution";
import {
  commandUninstallArtifact,
  uninstallCommand,
  type UninstallCommandOperation,
} from "@agentxm/client-core/unstable/commands";
import type { JobStepResult, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { UninstallCommandCommandIntent } from "./intent.js";
import {
  combinePlanSections,
  makeAgentSection,
  makeRenderedFilesSection,
} from "../preview-sections.js";

// -----------------------------------------------------------------------------
// Handler Args
// -----------------------------------------------------------------------------

export interface UninstallCommandHandlerArgs {
  readonly commandName: string;
}

// -----------------------------------------------------------------------------
// Parsed Args
// -----------------------------------------------------------------------------

export interface ParsedCommandUninstallArgs {
  readonly commandName: string;
}

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class UninstallCommandCommandWorkflowActions extends ServiceMap.Service<
  UninstallCommandCommandWorkflowActions,
  UninstallExtensionCommandWorkflowActions<
    UninstallCommandHandlerArgs,
    ParsedCommandUninstallArgs,
    UninstallCommandCommandIntent
  >
>()("axm.sh/root/commands/uninstall/command-actions/UninstallCommandCommandWorkflowActions") {}

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

/**
 * Constructs the actions by resolving all services at layer-build time.
 * Each action method closes over the captured services so `R = never`.
 */
export const UninstallCommandCommandWorkflowActionsLive = Layer.effect(
  UninstallCommandCommandWorkflowActions,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const agentRepo = yield* CodingAgentRepository;

    const parseArgs = (
      args: UninstallCommandHandlerArgs,
    ): Effect.Effect<ParsedCommandUninstallArgs, AppError> =>
      Effect.gen(function* () {
        const commandName = yield* resolveInstalledIdentifierNameOrInput({
          input: args.commandName.trim(),
          resourceType: "command",
        }).pipe(Effect.provideService(WorkspaceMutations, ws));
        return {
          commandName,
        };
      });

    const finalizeIntent = (
      parsed: ParsedCommandUninstallArgs,
    ): Effect.Effect<UninstallCommandCommandIntent, AppError> =>
      Effect.succeed({
        targets: [
          {
            type: "command",
            name: parsed.commandName,
          },
        ],
      } satisfies UninstallCommandCommandIntent);

    const buildUninstallPlan = (
      intent: UninstallCommandCommandIntent,
    ): Effect.Effect<Plan, AppError> =>
      Effect.gen(function* () {
        const lockEntries = yield* Effect.forEach(
          intent.targets,
          (target) => ws.getLockedCommand(target.name),
          { concurrency: "inherit" },
        );

        const targetNames = intent.targets.map((t) => t.name).join(", ");
        const affectedAgents = [
          ...new Set(
            lockEntries.flatMap((lockEntry) =>
              Option.isSome(lockEntry) ? [...lockEntry.value.agents] : [],
            ),
          ),
        ];
        const filesByAgent: Record<string, ReadonlyArray<{ readonly path: string }>> = {};

        for (const lockEntry of lockEntries) {
          if (Option.isNone(lockEntry) || lockEntry.value.renderedFiles === undefined) {
            continue;
          }

          for (const [agentId, files] of Object.entries(lockEntry.value.renderedFiles)) {
            filesByAgent[agentId] = [...(filesByAgent[agentId] ?? []), ...files];
          }
        }

        const sections = combinePlanSections(
          makeAgentSection("Affected agents", affectedAgents),
          makeRenderedFilesSection("Files that would be removed", filesByAgent),
        );
        const lockEntryByName = new Map(
          intent.targets.map((target, index) => [target.name, lockEntries[index] ?? Option.none()]),
        );
        const steps: ReadonlyArray<PlannedJobStep> = intent.targets.map((target) => {
          const op = {
            name: "uninstall-command",
            args: { commandName: target.name },
          } satisfies UninstallCommandOperation;

          const run = Effect.gen(function* () {
            const lockEntry = lockEntryByName.get(target.name) ?? Option.none();
            const stillRequiredByPack = yield* ws.isExtensionRequiredByInstalledPack(target);
            if (stillRequiredByPack) {
              yield* ws.removeCommandSettings(target.name);
              yield* ws.markDependencyRetainedInLockfile(target);
              return {
                result: "success",
                message: "Kept on disk because dependency is still required by an installed pack",
              } satisfies JobStepResult;
            }

            const result = yield* uninstallCommand(op).pipe(
              Effect.provideService(WorkspaceMutations, ws),
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provideService(Path.Path, path),
              Effect.provideService(CodingAgentRepository, agentRepo),
            );
            if (result.result === "error") {
              return result;
            }

            return {
              ...result,
              artifact: commandUninstallArtifact({
                commandName: target.name,
                lockEntry,
                scope: ws.scope,
                change: result.message === "not installed" ? "unchanged" : "removed",
              }),
            } satisfies JobStepResult;
          });

          return {
            readiness: "ready",
            label: target.name,
            run,
          } satisfies PlannedJobStep;
        });

        return {
          _tag: "Plan",
          name: "Uninstall command",
          description: Option.some(`Uninstall command ${targetNames}`),
          jobs: [{ concurrency: 1 as const, steps }],
          ...(sections === undefined ? {} : { sections }),
        } satisfies Plan;
      });

    return {
      parseArgs,
      finalizeIntent,
      buildUninstallPlan,
    };
  }),
);
