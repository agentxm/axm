import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { buildUninstallOperation } from "@agentxm/client-core/unstable/extensions";
import type { Plan } from "@agentxm/client-core/unstable/plan";
import { RuleManager, type RuleExtensionRef } from "@agentxm/client-core/unstable/rules";
import type { RuleExtensionTarget } from "@agentxm/client-core/unstable/workspace";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { UninstallRuleCommandIntent } from "./intent.js";
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";

export interface UninstallRuleHandlerArgs {
  readonly name: string;
}

export interface ParsedRuleUninstallArgs {
  readonly name: string;
}

export class UninstallRuleCommandWorkflowActions extends ServiceMap.Service<
  UninstallRuleCommandWorkflowActions,
  UninstallExtensionCommandWorkflowActions<
    UninstallRuleHandlerArgs,
    ParsedRuleUninstallArgs,
    UninstallRuleCommandIntent
  >
>()("axm.sh/root/rules/uninstall/command-actions/UninstallRuleCommandWorkflowActions") {}

export const UninstallRuleCommandWorkflowActionsLive = Layer.effect(
  UninstallRuleCommandWorkflowActions,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const ruleManager = yield* RuleManager;

    const parseArgs = (args: UninstallRuleHandlerArgs) =>
      Effect.succeed({ name: args.name.trim() });

    const finalizeIntent = (
      parsed: ParsedRuleUninstallArgs,
    ): Effect.Effect<UninstallRuleCommandIntent, AppError> =>
      Effect.gen(function* () {
        const locked = yield* ws.getLockedRuleEntry(parsed.name);
        const configured = yield* ws.getConfiguredRuleEntries();
        if (Option.isNone(locked) && configured[parsed.name] === undefined) {
          return yield* makeAppError({
            code: "not_found",
            detail: `rule "${parsed.name}" is not installed`,
          });
        }
        const target: RuleExtensionTarget = { type: "rule", name: parsed.name };
        return { targets: [target] };
      });

    const buildUninstallPlan = (
      intent: UninstallRuleCommandIntent,
      flags: { readonly sourceDisposition?: "keep" | "delete" },
    ): Effect.Effect<Plan, AppError> =>
      Effect.succeed({
        _tag: "Plan",
        name: "Uninstall rule",
        description: Option.some("Uninstall rule"),
        jobs: [
          {
            concurrency: 1,
            steps: intent.targets.map((target) =>
              buildUninstallOperation<RuleExtensionRef>(
                ruleManager,
                makeWorkspaceRetentionPolicy(ws),
                {
                  target,
                  ...(flags.sourceDisposition === undefined
                    ? {}
                    : { sourceDisposition: flags.sourceDisposition }),
                },
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
