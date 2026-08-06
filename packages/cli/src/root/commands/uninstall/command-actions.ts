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
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type { AppError } from "@agentxm/client-core/unstable/app-error";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { resolveInstalledIdentifierNameOrInput } from "@agentxm/client-core/unstable/source-resolution";
import { CommandManager, commandUninstallArtifact } from "@agentxm/client-core/unstable/commands";
import { buildUninstallOperation } from "@agentxm/client-core/unstable/extensions";
import type { JobStepResult, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { UninstallCommandCommandIntent } from "./intent.js";
import { combinePlanSections, makeAgentSection } from "../preview-sections.js";
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";

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
    const commandMgr = yield* CommandManager;

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
          (target) =>
            ws
              .getLockedCommand(target.name)
              .pipe(Effect.catch(() => Effect.succeed(Option.none()))),
          { concurrency: "inherit" },
        );

        const targetNames = intent.targets.map((t) => t.name).join(", ");
        const affectedAgents = yield* ws.getConfiguredAgents();

        const sections = combinePlanSections(makeAgentSection("Affected agents", affectedAgents));
        const lockEntryByName = new Map(
          intent.targets.map((target, index) => [target.name, lockEntries[index] ?? Option.none()]),
        );
        const steps: ReadonlyArray<PlannedJobStep> = intent.targets.map((target) => {
          const step = buildUninstallOperation(commandMgr, makeWorkspaceRetentionPolicy(ws), {
            target,
          });
          if (step.readiness !== "ready") return step;

          const run = step.run.pipe(
            Effect.map((result) => {
              const lockEntry = lockEntryByName.get(target.name) ?? Option.none();
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
            }),
          );

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
