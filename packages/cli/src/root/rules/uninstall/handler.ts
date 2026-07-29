import * as Effect from "effect/Effect";
import { runUninstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";
import { emitAppliedPlanOutcome } from "../../shared/applied-plan-output.js";
import {
  UninstallRuleCommandWorkflowActions,
  type UninstallRuleHandlerArgs,
} from "./command-actions.js";

export const handleUninstallRule = (
  args: UninstallRuleHandlerArgs,
  flags: {
    readonly yes: boolean;
    readonly force: boolean;
    readonly preview: boolean;
    readonly sourceDisposition?: "keep" | "delete";
  },
) =>
  Effect.gen(function* () {
    const actions = yield* UninstallRuleCommandWorkflowActions;
    const resolution = yield* runUninstallCommandWorkflow(args, actions, {
      ...flags,
      displayApplied: false,
    });
    yield* emitAppliedPlanOutcome({
      command: "rules.uninstall",
      headline: "Uninstalled rule " + args.name,
      resolution,
      suggestions: [{ description: "Inspect installed rules", cmd: "axm rules list" }],
    });
  });
