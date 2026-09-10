import * as Effect from "effect/Effect";
import { Argument, Command } from "effect/unstable/cli";

import { withArgvTracking } from "../../../cli-runtime/index.js";
import { operationPresentation } from "@agentxm/workspace-operations";
import {
  type UninstallExtensionCommandWorkflowActions,
  runUninstallCommandWorkflow,
} from "@agentxm/extension-lifecycle";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { emitOperationResolution } from "../../../operation-output.js";
import {
  previewableCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";
import { makeUninstallPlanExecution } from "../../shared/confirmation-recovery.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";
import { mutationFlags, scopeConfig } from "../flags.js";
import { UninstallKnowledgeCommandWorkflowActions } from "./command-actions.js";
import { type AppError } from "../../../app-error/index.js";

const uninstallPresentation = operationPresentation(
  { imperative: "uninstall", past: "Uninstalled", gerund: "Uninstalling" },
  "knowledge",
);

const withUninstallPresentation = <Args, Parsed, Intent>(
  actions: UninstallExtensionCommandWorkflowActions<Args, Parsed, Intent, AppError>,
): UninstallExtensionCommandWorkflowActions<Args, Parsed, Intent, AppError> => ({
  ...actions,
  buildUninstallPlan: (intent, workflowFlags) =>
    actions
      .buildUninstallPlan(intent, workflowFlags)
      .pipe(Effect.map((plan) => ({ ...plan, presentation: uninstallPresentation }))),
});

export interface KnowledgeUninstallHandlerArgs {
  readonly name: string;
  readonly preview: boolean;
}

export const handleKnowledgeUninstall = (args: KnowledgeUninstallHandlerArgs) =>
  withOperationLifecycle(
    {
      command: "knowledge.uninstall",
      mode: args.preview ? "preview" : "apply",
      planName: "Uninstall knowledge",
      presentation: uninstallPresentation,
    },
    Effect.gen(function* () {
      const actions = yield* UninstallKnowledgeCommandWorkflowActions;
      const execution = yield* makeUninstallPlanExecution(
        { preview: args.preview },
        ["knowledge", "uninstall"],
        [args.name],
      );
      const resolution = yield* runUninstallCommandWorkflow(
        { name: args.name },
        withUninstallPresentation(actions),
        { execution },
      );
      yield* emitOperationResolution("knowledge.uninstall", resolution, {
        suggestions: [{ description: "Browse installed Knowledge", cmd: "axm knowledge list" }],
      });
    }),
  );

const uninstallConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Configured Knowledge bundle name")),
  ...scopeConfig,
  ...mutationFlags,
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ name, scope, preview }) =>
    handleKnowledgeUninstall({ name, preview }).pipe(
      withWorkspace(scope),
      withRuntime("knowledge uninstall"),
    ),
).pipe(
  withArgvTracking(uninstallConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
  Command.withDescription("Uninstall a Knowledge bundle"),
  Command.withExamples([
    {
      command: "axm knowledge uninstall platform --preview",
      description: "Preview removing one Knowledge bundle",
    },
  ]),
);
