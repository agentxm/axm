import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { DocsManager, type DocsExtensionRef } from "@agentxm/client-core/unstable/docs";
import { buildUninstallOperation } from "@agentxm/client-core/unstable/extensions";
import type { Plan } from "@agentxm/client-core/unstable/plan";
import type { ExtensionTarget, DocsExtensionTarget } from "@agentxm/client-core/unstable/workspace";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { UninstallDocsCommandIntent } from "./intent.js";

export interface UninstallDocsHandlerArgs {
  readonly name: string;
}

export interface ParsedDocsUninstallArgs {
  readonly name: string;
}

export class UninstallDocsCommandWorkflowActions extends ServiceMap.Service<
  UninstallDocsCommandWorkflowActions,
  UninstallExtensionCommandWorkflowActions<
    UninstallDocsHandlerArgs,
    ParsedDocsUninstallArgs,
    UninstallDocsCommandIntent
  >
>()("axm.sh/root/docs/uninstall/command-actions/UninstallDocsCommandWorkflowActions") {}

export const UninstallDocsCommandWorkflowActionsLive = Layer.effect(
  UninstallDocsCommandWorkflowActions,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const docsManager = yield* DocsManager;

    const parseArgs = (args: UninstallDocsHandlerArgs) =>
      Effect.succeed({ name: args.name.trim() });

    const finalizeIntent = (
      parsed: ParsedDocsUninstallArgs,
    ): Effect.Effect<UninstallDocsCommandIntent, AppError> =>
      Effect.gen(function* () {
        const locked = yield* ws.getLockedDocsEntry(parsed.name);
        const configured = yield* ws.getConfiguredDocsEntries();
        if (Option.isNone(locked) && configured[parsed.name] === undefined) {
          return yield* makeAppError({
            code: "not_found",
            detail: `docs package "${parsed.name}" is not installed`,
          });
        }
        const target: DocsExtensionTarget = { type: "docs", name: parsed.name };
        return { targets: [target] };
      });

    const buildUninstallPlan = (
      intent: UninstallDocsCommandIntent,
    ): Effect.Effect<Plan, AppError> =>
      Effect.succeed({
        _tag: "Plan",
        name: "Uninstall docs",
        description: Option.some("Uninstall docs package"),
        jobs: [
          {
            concurrency: 1,
            steps: intent.targets.map((target) =>
              buildUninstallOperation<DocsExtensionRef>(
                docsManager,
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
