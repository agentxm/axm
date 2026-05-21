import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { ContextManager, type ContextExtensionRef } from "@agentxm/client-core/unstable/context";
import { buildUninstallOperation } from "@agentxm/client-core/unstable/extensions";
import type { Plan } from "@agentxm/client-core/unstable/plan";
import type {
  ExtensionTarget,
  ContextExtensionTarget,
} from "@agentxm/client-core/unstable/workspace";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { UninstallContextCommandIntent } from "./intent.js";

export interface UninstallContextHandlerArgs {
  readonly name: string;
}

export interface ParsedContextUninstallArgs {
  readonly name: string;
}

export class UninstallContextCommandWorkflowActions extends ServiceMap.Service<
  UninstallContextCommandWorkflowActions,
  UninstallExtensionCommandWorkflowActions<
    UninstallContextHandlerArgs,
    ParsedContextUninstallArgs,
    UninstallContextCommandIntent
  >
>()("axm.sh/root/context/uninstall/command-actions/UninstallContextCommandWorkflowActions") {}

export const UninstallContextCommandWorkflowActionsLive = Layer.effect(
  UninstallContextCommandWorkflowActions,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const contextManager = yield* ContextManager;

    const parseArgs = (args: UninstallContextHandlerArgs) =>
      Effect.succeed({ name: args.name.trim() });

    const finalizeIntent = (
      parsed: ParsedContextUninstallArgs,
    ): Effect.Effect<UninstallContextCommandIntent, AppError> =>
      Effect.gen(function* () {
        const locked = yield* ws.getLockedContextEntry(parsed.name);
        const configured = yield* ws.getConfiguredContextEntries();
        if (Option.isNone(locked) && configured[parsed.name] === undefined) {
          return yield* makeAppError({
            code: "not_found",
            detail: `context package "${parsed.name}" is not installed`,
          });
        }
        const target: ContextExtensionTarget = { type: "context", name: parsed.name };
        return { targets: [target] };
      });

    const buildUninstallPlan = (
      intent: UninstallContextCommandIntent,
    ): Effect.Effect<Plan, AppError> =>
      Effect.succeed({
        _tag: "Plan",
        name: "Uninstall context",
        description: Option.some("Uninstall context package"),
        jobs: [
          {
            concurrency: 1,
            steps: intent.targets.map((target) =>
              buildUninstallOperation<ContextExtensionRef>(
                contextManager,
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
