import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { HookManager, type HookExtensionRef } from "@agentxm/client-core/unstable/hooks";
import { buildUninstallOperation } from "@agentxm/client-core/unstable/extensions";
import type { Plan } from "@agentxm/client-core/unstable/plan";
import type { ExtensionTarget, HookExtensionTarget } from "@agentxm/client-core/unstable/workspace";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { UninstallHookCommandIntent } from "./intent.js";

export interface UninstallHookHandlerArgs {
  readonly name: string;
}

export interface ParsedHookUninstallArgs {
  readonly name: string;
}

export class UninstallHookCommandWorkflowActions extends ServiceMap.Service<
  UninstallHookCommandWorkflowActions,
  UninstallExtensionCommandWorkflowActions<
    UninstallHookHandlerArgs,
    ParsedHookUninstallArgs,
    UninstallHookCommandIntent
  >
>()("axm.sh/root/hooks/uninstall/command-actions/UninstallHookCommandWorkflowActions") {}

export const UninstallHookCommandWorkflowActionsLive = Layer.effect(
  UninstallHookCommandWorkflowActions,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const hookManager = yield* HookManager;

    const parseArgs = (args: UninstallHookHandlerArgs) =>
      Effect.succeed({ name: args.name.trim() });

    const finalizeIntent = (
      parsed: ParsedHookUninstallArgs,
    ): Effect.Effect<UninstallHookCommandIntent, AppError> =>
      Effect.gen(function* () {
        const locked = yield* ws.getLockedHookEntry(parsed.name);
        const configured = yield* ws.getConfiguredHookEntries();
        if (Option.isNone(locked) && configured[parsed.name] === undefined) {
          return yield* makeAppError({
            code: "not_found",
            detail: `hooks package "${parsed.name}" is not installed`,
          });
        }
        const target: HookExtensionTarget = { type: "hook", name: parsed.name };
        return { targets: [target] };
      });

    const buildUninstallPlan = (
      intent: UninstallHookCommandIntent,
    ): Effect.Effect<Plan, AppError> =>
      Effect.succeed({
        _tag: "Plan",
        name: "Uninstall hooks",
        description: Option.some("Uninstall hooks package"),
        jobs: [
          {
            concurrency: 1,
            steps: intent.targets.map((target) =>
              buildUninstallOperation<HookExtensionRef>(
                hookManager,
                {
                  isRequiredByInstalledPack: (args: { readonly target: ExtensionTarget }) =>
                    ws.isExtensionRequiredByInstalledPack(args.target),
                  markDependencyRetainedInLockfile: (args: { readonly target: ExtensionTarget }) =>
                    ws.markDependencyRetainedInLockfile(args.target),
                },
                { target },
              ),
            ),
          },
        ],
      } satisfies Plan);

    return {
      parseArgs,
      finalizeIntent,
      buildUninstallPlan,
    };
  }),
);
