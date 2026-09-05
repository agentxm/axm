import * as Effect from "effect/Effect";
import {
  deriveOperationOutcome,
  operationPresentation,
  type Plan,
} from "@agentxm/workspace-operations";
import { runInstallCommandWorkflow } from "@agentxm/extension-lifecycle";
import { emitOperationResolution } from "../../../operation-output.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";
import { makeInstallPlanExecution } from "../../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import {
  InstallRuleCommandWorkflowActions,
  type InstallRuleHandlerArgs,
} from "./command-actions.js";

export const handleInstallRule = (
  args: InstallRuleHandlerArgs,
  flags: { readonly force: boolean; readonly preview: boolean },
) =>
  withOperationLifecycle(
    {
      command: "rules.install",
      mode: flags.preview ? "preview" : "apply",
      planName: "Install rules",
    },
    handleInstallRuleBody(args, flags),
  );

const handleInstallRuleBody = (
  args: InstallRuleHandlerArgs,
  flags: { readonly force: boolean; readonly preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* InstallRuleCommandWorkflowActions;
    const execution = yield* makeInstallPlanExecution(flags, ["rules", "install"], [args.source]);
    const resolution = yield* runInstallCommandWorkflow(args, actions, {
      execution,
      transformPlan: (plan) =>
        Effect.succeed({
          ...plan,
          presentation: operationPresentation(
            { imperative: "install", past: "Installed", gerund: "Installing" },
            "rule",
          ),
        } satisfies Plan),
    });
    if (deriveOperationOutcome(resolution) === "no-op" && resolution.units.length === 0) {
      yield* emitNoOpOutcome("rules.install", {
        planName: resolution.name,
        message: "No rules installed.",
      });
      return;
    }
    yield* emitOperationResolution("rules.install", resolution, {
      suggestions: [{ description: "Inspect installed rules", cmd: "axm rules list" }],
    });
  });
