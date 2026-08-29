import * as Effect from "effect/Effect";
import { Argument, Command } from "effect/unstable/cli";

import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { operationPresentation } from "@agentxm/client-core/unstable/plan";
import {
  runUninstallCommandWorkflow,
  type UninstallExtensionCommandWorkflowActions,
} from "@agentxm/client-core/unstable/workflows";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { emitOperationResolution } from "../../../operation-output.js";
import { makeUninstallPlanExecution } from "../../shared/confirmation-recovery.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";
import { mutationFlags, scopeConfig } from "../flags.js";
import { UninstallKnowledgeCommandWorkflowActions } from "./command-actions.js";

const uninstallPresentation = operationPresentation(
  { imperative: "uninstall", past: "Uninstalled", gerund: "Uninstalling" },
  "knowledge",
);

const withUninstallPresentation = <Args, Parsed, Intent>(
  actions: UninstallExtensionCommandWorkflowActions<Args, Parsed, Intent>,
): UninstallExtensionCommandWorkflowActions<Args, Parsed, Intent> => ({
  ...actions,
  buildUninstallPlan: (intent, workflowFlags) =>
    actions
      .buildUninstallPlan(intent, workflowFlags)
      .pipe(Effect.map((plan) => ({ ...plan, presentation: uninstallPresentation }))),
});

const uninstallConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Configured Knowledge bundle name")),
  ...scopeConfig,
  ...mutationFlags,
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ name, scope, yes, preview }) =>
    withOperationLifecycle(
      {
        command: "knowledge.uninstall",
        mode: preview ? "preview" : "apply",
        planName: "Uninstall knowledge",
        presentation: uninstallPresentation,
      },
      Effect.gen(function* () {
        const actions = yield* UninstallKnowledgeCommandWorkflowActions;
        const execution = yield* makeUninstallPlanExecution(
          { yes, preview },
          ["knowledge", "uninstall"],
          [name],
        );
        const resolution = yield* runUninstallCommandWorkflow(
          { name },
          withUninstallPresentation(actions),
          { execution },
        );
        yield* emitOperationResolution("knowledge.uninstall", resolution, {
          suggestions: [{ description: "Browse installed Knowledge", cmd: "axm knowledge list" }],
        });
      }),
    ).pipe(withWorkspace(scope), withRuntime("knowledge uninstall")),
).pipe(
  withArgvTracking(uninstallConfig),
  Command.withDescription("Uninstall a Knowledge bundle"),
  Command.withExamples([
    {
      command: "axm knowledge uninstall platform --preview",
      description: "Preview removing one Knowledge bundle",
    },
  ]),
);
