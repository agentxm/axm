import * as Effect from "effect/Effect";
import type { StepRequirements } from "../../shared/step-requirements.js";
import * as Option from "effect/Option";

import type { AppError } from "../../../app-error/index.js";
import { failureToStepFailure, toAppError } from "../../../app-error/conversions.js";
import { buildUninstallOperation } from "@agentxm/extension-materialization";
import type { Plan } from "@agentxm/workspace-operations";
import { type RuleExtensionTarget, WorkspaceMutations } from "@agentxm/workspace-state";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/extension-lifecycle";
import type { UninstallRuleCommandIntent } from "./intent.js";
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";
import { RuleManager } from "@agentxm/extension-materialization";
export interface UninstallRuleHandlerArgs {
  readonly name: string;
}

export interface ParsedRuleUninstallArgs {
  readonly name: string;
}

type UninstallRuleActions = UninstallExtensionCommandWorkflowActions<
  UninstallRuleHandlerArgs,
  ParsedRuleUninstallArgs,
  UninstallRuleCommandIntent,
  AppError,
  StepRequirements
>;

export const UninstallRuleCommandWorkflowActions = Effect.gen(function* () {
  const ws = yield* WorkspaceMutations;
  const ruleManager = yield* RuleManager;

  const parseArgs = (args: UninstallRuleHandlerArgs) => Effect.succeed({ name: args.name.trim() });

  const finalizeIntent = (
    parsed: ParsedRuleUninstallArgs,
  ): Effect.Effect<UninstallRuleCommandIntent, AppError, StepRequirements> =>
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

  const buildUninstallPlan = (
    intent: UninstallRuleCommandIntent,
  ): Effect.Effect<Plan<StepRequirements>, AppError, StepRequirements> =>
    Effect.succeed({
      _tag: "Plan",
      name: "Uninstall rule",
      description: Option.some("Uninstall rule"),
      jobs: [
        {
          concurrency: 1,
          steps: intent.targets.map((target) =>
            buildUninstallOperation(ruleManager, makeWorkspaceRetentionPolicy(ws), {
              target,
              toStepFailure: failureToStepFailure,
            }),
          ),
        },
      ],
    } satisfies Plan<StepRequirements>);

  return {
    parseArgs,
    finalizeIntent,
    buildUninstallPlan,
  };
}).pipe(Effect.map((actions): UninstallRuleActions => actions));
