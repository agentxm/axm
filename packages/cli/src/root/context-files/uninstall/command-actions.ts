import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import {
  ContextFilesManager,
  type ContextFilesExtensionRef,
} from "@agentxm/client-core/unstable/context-files";
import { buildUninstallOperation } from "@agentxm/client-core/unstable/extensions";
import type { Plan } from "@agentxm/client-core/unstable/plan";
import type {
  ExtensionTarget,
  ContextFilesExtensionTarget,
} from "@agentxm/client-core/unstable/workspace";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { UninstallContextFilesCommandIntent } from "./intent.js";

export interface UninstallContextFilesHandlerArgs {
  readonly name: string;
}

export interface ParsedContextFilesUninstallArgs {
  readonly name: string;
}

export class UninstallContextFilesCommandWorkflowActions extends ServiceMap.Service<
  UninstallContextFilesCommandWorkflowActions,
  UninstallExtensionCommandWorkflowActions<
    UninstallContextFilesHandlerArgs,
    ParsedContextFilesUninstallArgs,
    UninstallContextFilesCommandIntent
  >
>()(
  "axm.sh/root/context-files/uninstall/command-actions/UninstallContextFilesCommandWorkflowActions",
) {}

export const UninstallContextFilesCommandWorkflowActionsLive = Layer.effect(
  UninstallContextFilesCommandWorkflowActions,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const contextFilesManager = yield* ContextFilesManager;

    const parseArgs = (args: UninstallContextFilesHandlerArgs) =>
      Effect.succeed({ name: args.name.trim() });

    const finalizeIntent = (
      parsed: ParsedContextFilesUninstallArgs,
    ): Effect.Effect<UninstallContextFilesCommandIntent, AppError> =>
      Effect.gen(function* () {
        const locked = yield* ws.getLockedFile(parsed.name);
        const configured = yield* ws.getConfiguredFileEntries();
        if (Option.isNone(locked) && configured[parsed.name] === undefined) {
          return yield* makeAppError({
            code: "not_found",
            detail: `Context files package "${parsed.name}" is not installed`,
          });
        }
        const target: ContextFilesExtensionTarget = { type: "file", name: parsed.name };
        return { targets: [target] };
      });

    const buildUninstallPlan = (
      intent: UninstallContextFilesCommandIntent,
    ): Effect.Effect<Plan, AppError> =>
      Effect.succeed({
        _tag: "Plan",
        name: "Uninstall context files",
        description: Option.some("Uninstall context files package"),
        jobs: [
          {
            concurrency: 1,
            steps: intent.targets.map((target) =>
              buildUninstallOperation<ContextFilesExtensionRef>(
                contextFilesManager,
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
