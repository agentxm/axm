import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command } from "effect/unstable/cli";

import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import { operationPresentation, type Plan } from "@agentxm/extension-management/unstable/plan";
import { runInstallCommandWorkflow } from "@agentxm/extension-management/unstable/extension-lifecycle";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { emitOperationResolution } from "../../../operation-output.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
import { makeInstallPlanExecution } from "../../shared/confirmation-recovery.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";
import { mutationFlags, scopeConfig } from "../flags.js";
import { InstallKnowledgeCommandWorkflowActions } from "./command-actions.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Knowledge source (@owner/knowledge/name, path, URL, or git locator)"),
    Argument.optional,
  ),
  ...scopeConfig,
  ...mutationFlags,
} as const;

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, yes, preview }) =>
    withOperationLifecycle(
      {
        command: "knowledge.install",
        mode: preview ? "preview" : "apply",
        planName: "Install Knowledge",
      },
      Option.match(source, {
        onNone: () =>
          handleWorkspaceInstall({
            command: "knowledge.install",
            type: Option.some("knowledge"),
            planName: "Install Knowledge",
            planDescription: Option.some("Install configured Knowledge bundles"),
            flags: { yes, preview },
          }),
        onSome: (value) =>
          Effect.gen(function* () {
            const actions = yield* InstallKnowledgeCommandWorkflowActions;
            const execution = yield* makeInstallPlanExecution(
              { yes, preview },
              ["knowledge", "install"],
              [value],
            );
            const resolution = yield* runInstallCommandWorkflow({ source: value }, actions, {
              execution,
              transformPlan: (plan) =>
                Effect.succeed({
                  ...plan,
                  presentation: operationPresentation(
                    { imperative: "install", past: "Installed", gerund: "Installing" },
                    "knowledge",
                  ),
                } satisfies Plan),
            });
            yield* emitOperationResolution("knowledge.install", resolution, {
              suggestions: [
                { description: "Browse installed Knowledge", cmd: "axm knowledge list" },
              ],
            });
          }),
      }),
    ).pipe(withWorkspace(scope), withRuntime("knowledge install")),
).pipe(
  withArgvTracking(installConfig),
  Command.withDescription("Install or restore Knowledge bundles"),
  Command.withExamples([
    {
      command: "axm knowledge install @acme/knowledge/platform",
      description: "Install a Knowledge bundle from the registry",
    },
  ]),
);
