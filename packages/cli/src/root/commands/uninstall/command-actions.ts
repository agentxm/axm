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
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { resolveInstalledIdentifierNameOrInput } from "@agentxm/client-core/unstable/source-resolution";
import { CommandManager, type CommandExtensionRef } from "@agentxm/client-core/unstable/commands";
import type { Plan } from "@agentxm/client-core/unstable/plan";
import type {
  CommandExtensionTarget,
  ExtensionTarget,
} from "@agentxm/client-core/unstable/workspace";
import { buildUninstallOperation } from "@agentxm/client-core/unstable/extensions";
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
>()("axm.sh/UninstallCommandCommandWorkflowActions") {}

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
      Effect.gen(function* () {
        const lockEntry = yield* ws.getLockedCommand(parsed.commandName);
        if (Option.isNone(lockEntry)) {
          return yield* makeAppError({
            code: "COMMAND_NOT_INSTALLED",
            what: `Command "${parsed.commandName}" is not installed`,
            howToFix: "Check installed commands and verify the name.",
          });
        }

        const target: CommandExtensionTarget = {
          type: "command",
          name: parsed.commandName,
        };

        return { targets: [target] };
      });

    const buildUninstallPlan = (
      intent: UninstallCommandCommandIntent,
    ): Effect.Effect<Plan, AppError> =>
      Effect.gen(function* () {
        const retentionPolicy = {
          isRequiredByInstalledPack: (args: { readonly target: ExtensionTarget }) =>
            ws.isExtensionRequiredByInstalledExtensionPack(args.target),
          markDependencyRetainedInLockfile: (args: { readonly target: ExtensionTarget }) =>
            ws.markDependencyRetainedInLockfile(args.target),
        };

        const steps = intent.targets.map((target) =>
          buildUninstallOperation<CommandExtensionRef>(commandMgr, retentionPolicy, { target }),
        );

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
