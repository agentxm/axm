import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { FilesManager, type FilesExtensionRef } from "@agentxm/client-core/unstable/files";
import { buildUninstallOperation } from "@agentxm/client-core/unstable/extensions";
import type { Plan } from "@agentxm/client-core/unstable/plan";
import type {
  ExtensionTarget,
  FilesExtensionTarget,
} from "@agentxm/client-core/unstable/workspace";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { UninstallFilesCommandIntent } from "./intent.js";

export interface UninstallFilesHandlerArgs {
  readonly name: string;
}

export interface ParsedFilesUninstallArgs {
  readonly name: string;
}

export class UninstallFilesCommandWorkflowActions extends ServiceMap.Service<
  UninstallFilesCommandWorkflowActions,
  UninstallExtensionCommandWorkflowActions<
    UninstallFilesHandlerArgs,
    ParsedFilesUninstallArgs,
    UninstallFilesCommandIntent
  >
>()("axm.sh/root/files/uninstall/command-actions/UninstallFilesCommandWorkflowActions") {}

export const UninstallFilesCommandWorkflowActionsLive = Layer.effect(
  UninstallFilesCommandWorkflowActions,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const filesManager = yield* FilesManager;

    const parseArgs = (args: UninstallFilesHandlerArgs) =>
      Effect.succeed({ name: args.name.trim() });

    const finalizeIntent = (
      parsed: ParsedFilesUninstallArgs,
    ): Effect.Effect<UninstallFilesCommandIntent, AppError> =>
      Effect.gen(function* () {
        const locked = yield* ws.getLockedFilesEntry(parsed.name);
        const configured = yield* ws.getConfiguredFilesEntries();
        if (Option.isNone(locked) && configured[parsed.name] === undefined) {
          return yield* makeAppError({
            code: "not_found",
            detail: `files package "${parsed.name}" is not installed`,
          });
        }
        const target: FilesExtensionTarget = { type: "files", name: parsed.name };
        return { targets: [target] };
      });

    const buildUninstallPlan = (
      intent: UninstallFilesCommandIntent,
    ): Effect.Effect<Plan, AppError> =>
      Effect.succeed({
        _tag: "Plan",
        name: "Uninstall files",
        description: Option.some("Uninstall files package"),
        jobs: [
          {
            concurrency: 1,
            steps: intent.targets.map((target) =>
              buildUninstallOperation<FilesExtensionRef>(
                filesManager,
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
