/**
 * Command uninstall workflow actions service.
 *
 * Implements UninstallExtensionCommandWorkflowActions for commands.
 * The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeAppError, type AppError } from "@axm.sh/core/unstable/app-error";
import { Workspace } from "../../../workspace/service.js";
import { CommandManager } from "@axm.sh/core/unstable/extension-managers";
import type { Plan } from "../../../workspace/plan.js";
import type { CommandExtensionTarget, ExtensionTarget } from "@axm.sh/core/unstable/workspace";
import { buildUninstallOperation } from "@axm.sh/core/unstable/extension-operations";
import type { UninstallExtensionCommandWorkflowActions } from "../../../workflows/uninstall-command/index.js";
import type { UninstallCommandCommandIntent } from "./intent.js";
import type { CommandExtensionRef } from "@axm.sh/core/unstable/sources";

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
>()("@axm.sh/cli/UninstallCommandCommandWorkflowActions") {}

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
    const ws = yield* Workspace;
    const commandMgr = yield* CommandManager;

    const parseArgs = (
      args: UninstallCommandHandlerArgs,
    ): Effect.Effect<ParsedCommandUninstallArgs, AppError> =>
      Effect.succeed({ commandName: args.commandName.trim() });

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
    ): Effect.Effect<Plan, AppError> => {
      const retentionPolicy = {
        isRequiredByInstalledPack: (args: { readonly target: ExtensionTarget }) =>
          ws.isExtensionRequiredByInstalledPack(args.target),
        markDependencyRetainedInLockfile: (args: { readonly target: ExtensionTarget }) =>
          ws.markDependencyRetainedInLockfile(args.target),
      };

      const steps = intent.targets.map((target) =>
        buildUninstallOperation<CommandExtensionRef>(commandMgr, retentionPolicy, { target }),
      );

      return Effect.succeed({
        _tag: "Plan",
        name: "Uninstall command",
        description: Option.some(
          `Uninstall command ${intent.targets.map((t) => t.name).join(", ")}`,
        ),
        jobs: [{ concurrency: 1 as const, steps }],
      } satisfies Plan);
    };

    return {
      parseArgs,
      finalizeIntent,
      buildUninstallPlan,
    };
  }),
);
