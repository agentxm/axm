/**
 * Command uninstall workflow actions service.
 *
 * Implements UninstallExtensionCommandWorkflowActions for commands.
 * The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeCliError, type CliError } from "../../../cli-error/index.js";
import { Workspace } from "../../../workspace/service.js";
import { CommandManager } from "../../../extensions/commands/manager.js";
import type { Plan } from "../../../workspace/plan.js";
import type {
  CommandExtensionTarget,
  ExtensionTarget,
} from "../../../workflows/install-operation/index.js";
import { buildUninstallOperation } from "../../../workflows/uninstall-operation/index.js";
import type { UninstallExtensionCommandWorkflowActions } from "../../../workflows/uninstall-command/index.js";
import type { UninstallCommandCommandIntent } from "./intent.js";
import type { CommandExtensionRef } from "../../../sources/types.js";

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

export class UninstallCommandCommandWorkflowActions extends Context.Tag(
  "@axm.sh/cli/UninstallCommandCommandWorkflowActions",
)<
  UninstallCommandCommandWorkflowActions,
  UninstallExtensionCommandWorkflowActions<
    UninstallCommandHandlerArgs,
    ParsedCommandUninstallArgs,
    UninstallCommandCommandIntent
  >
>() {}

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
    ): Effect.Effect<ParsedCommandUninstallArgs, CliError> =>
      Effect.succeed({ commandName: args.commandName.trim() });

    const finalizeIntent = (
      parsed: ParsedCommandUninstallArgs,
    ): Effect.Effect<UninstallCommandCommandIntent, CliError> =>
      Effect.gen(function* () {
        const lockEntry = yield* ws.getLockedCommand(parsed.commandName);
        if (Option.isNone(lockEntry)) {
          return yield* makeCliError({
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
    ): Effect.Effect<Plan, CliError> => {
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
