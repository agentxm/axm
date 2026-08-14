import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import type { AppError } from "@agentxm/client-core/unstable/app-error";
import { buildUninstallOperation } from "@agentxm/client-core/unstable/extensions";
import {
  KnowledgeManager,
  KnowledgeManagerLive,
  type KnowledgeExtensionRef,
} from "@agentxm/client-core/unstable/knowledge";
import type { Plan } from "@agentxm/client-core/unstable/plan";
import type { KnowledgeExtensionTarget } from "@agentxm/client-core/unstable/workspace";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";
import type { UninstallKnowledgeCommandIntent } from "./intent.js";

export interface UninstallKnowledgeHandlerArgs {
  readonly name: string;
}

interface ParsedKnowledgeUninstallArgs {
  readonly name: string;
}

type KnowledgeUninstallActions = UninstallExtensionCommandWorkflowActions<
  UninstallKnowledgeHandlerArgs,
  ParsedKnowledgeUninstallArgs,
  UninstallKnowledgeCommandIntent
>;

export class UninstallKnowledgeCommandWorkflowActions extends ServiceMap.Service<
  UninstallKnowledgeCommandWorkflowActions,
  KnowledgeUninstallActions
>()("axm.sh/root/knowledge/uninstall/command-actions/UninstallKnowledgeCommandWorkflowActions") {}

export const makeUninstallKnowledgeCommandWorkflowActions = Effect.gen(function* () {
  const ws = yield* WorkspaceMutations;
  const manager = yield* KnowledgeManager;
  return {
    parseArgs: (args) => Effect.succeed({ name: args.name.trim() }),
    finalizeIntent: (parsed): Effect.Effect<UninstallKnowledgeCommandIntent, AppError> =>
      Effect.gen(function* () {
        const target: KnowledgeExtensionTarget = { type: "knowledge", name: parsed.name };
        const configured =
          manager.getConfiguredSource === undefined
            ? Option.none<string>()
            : yield* manager.getConfiguredSource({ target });
        const installed = yield* manager.isInstalled({ target });
        if (Option.isNone(configured) && !installed) {
          return { targets: [] };
        }
        return { targets: [target] };
      }),
    buildUninstallPlan: (intent) =>
      Effect.succeed({
        _tag: "Plan",
        name: "Uninstall knowledge",
        description: Option.some("Uninstall Open Knowledge Format bundle"),
        jobs: [
          {
            concurrency: 1,
            steps: intent.targets.map((target) =>
              buildUninstallOperation<KnowledgeExtensionRef>(
                manager,
                makeWorkspaceRetentionPolicy(ws),
                { target },
              ),
            ),
          },
        ],
      } satisfies Plan),
  } satisfies KnowledgeUninstallActions;
}).pipe(Effect.provide(KnowledgeManagerLive));

export const UninstallKnowledgeCommandWorkflowActionsLive = Layer.effect(
  UninstallKnowledgeCommandWorkflowActions,
  makeUninstallKnowledgeCommandWorkflowActions,
);
