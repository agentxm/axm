import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { AppError } from "@agentxm/extension-management/unstable/app-error";
import { toAppError } from "@agentxm/extension-management/unstable/app-error/conversions";
import { buildUninstallOperation } from "@agentxm/extension-management/unstable/extensions";
import type { Plan } from "@agentxm/extension-management/unstable/plan";
import { RuleManager } from "@agentxm/extension-management/unstable/rules";
import {
  type RuleExtensionRef,
  type RuleExtensionTarget,
  WorkspaceMutations,
} from "@agentxm/extension-management/unstable/workspace";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/extension-management/unstable/workflows";
import type { UninstallRuleCommandIntent } from "./intent.js";
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";

export interface UninstallRuleHandlerArgs {
  readonly name: string;
}

export interface ParsedRuleUninstallArgs {
  readonly name: string;
}

type UninstallRuleActions = UninstallExtensionCommandWorkflowActions<
  UninstallRuleHandlerArgs,
  ParsedRuleUninstallArgs,
  UninstallRuleCommandIntent
>;

export const UninstallRuleCommandWorkflowActions = Effect.gen(function* () {
  const ws = yield* WorkspaceMutations;
  const ruleManager = yield* RuleManager;

  const parseArgs = (args: UninstallRuleHandlerArgs) => Effect.succeed({ name: args.name.trim() });

  const finalizeIntent = (
    parsed: ParsedRuleUninstallArgs,
  ): Effect.Effect<UninstallRuleCommandIntent, AppError> =>
    Effect.gen(function* () {
      const target: RuleExtensionTarget = { type: "rule", name: parsed.name };
      const configured =
        ruleManager.getConfiguredSource === undefined
          ? Option.none<string>()
          : yield* ruleManager.getConfiguredSource({ target });
      const installed = yield* ruleManager.isInstalled({ target });
      if (Option.isNone(configured) && !installed) {
        return { targets: [] };
      }
      return { targets: [target] };
    }).pipe(Effect.mapError(toAppError));

  const buildUninstallPlan = (intent: UninstallRuleCommandIntent): Effect.Effect<Plan, AppError> =>
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
}).pipe(Effect.map((actions): UninstallRuleActions => actions));
