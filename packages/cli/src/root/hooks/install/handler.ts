import * as Effect from "effect/Effect";
import {
  deriveOperationOutcome,
  operationPresentation,
  type Plan,
} from "@agentxm/extension-management/unstable/plan";
import { runInstallCommandWorkflow } from "@agentxm/extension-management/unstable/workflows";
import { emitOperationResolution } from "../../../operation-output.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";
import { makeInstallPlanExecution } from "../../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import {
  InstallHookCommandWorkflowActions,
  type InstallHookHandlerArgs,
} from "./command-actions.js";

export const handleInstallHook = (
  args: InstallHookHandlerArgs,
  flags: { readonly yes: boolean; readonly force: boolean; readonly preview: boolean },
) =>
  withOperationLifecycle(
    {
      command: "hooks.install",
      mode: flags.preview ? "preview" : "apply",
      planName: "Install hooks",
    },
    handleInstallHookBody(args, flags),
  );

const handleInstallHookBody = (
  args: InstallHookHandlerArgs,
  flags: { readonly yes: boolean; readonly force: boolean; readonly preview: boolean },
) =>
  Effect.gen(function* () {
    const actions = yield* InstallHookCommandWorkflowActions;
    const execution = yield* makeInstallPlanExecution(flags, ["hooks", "install"], [args.source]);
    const resolution = yield* runInstallCommandWorkflow(args, actions, {
      execution,
      transformPlan: (plan) =>
        Effect.succeed({
          ...plan,
          presentation: operationPresentation(
            { imperative: "install", past: "Installed", gerund: "Installing" },
            "hook",
          ),
        } satisfies Plan),
    });
    if (deriveOperationOutcome(resolution) === "no-op" && resolution.units.length === 0) {
      yield* emitNoOpOutcome("hooks.install", {
        planName: resolution.name,
        message: "No hooks packages installed.",
      });
      return;
    }
    yield* emitOperationResolution("hooks.install", resolution, {
      suggestions: [{ description: "Inspect installed hooks packages", cmd: "axm hooks list" }],
    });
  });
