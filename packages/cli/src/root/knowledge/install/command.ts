import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command } from "effect/unstable/cli";

import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { runInstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
import { emitAppliedPlanOutcome } from "../../shared/applied-plan-output.js";
import { makeInstallPlanExecutionMode } from "../../shared/confirmation-recovery.js";
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
          // Resolve the workflow actions as a service: `runtime.ts` wires
          // InstallKnowledgeCommandWorkflowActionsLive over KnowledgeManagerLive
          // so one KnowledgeManager instance serves the whole run.
          const actions = yield* InstallKnowledgeCommandWorkflowActions;
          const execution = yield* makeInstallPlanExecutionMode(
            { yes, preview },
            ["knowledge", "install"],
            [value],
          );
          const resolution = yield* runInstallCommandWorkflow({ source: value }, actions, {
            execution,
            displayApplied: false,
          });
          yield* emitAppliedPlanOutcome({
            command: "knowledge.install",
            headline: `Installed Knowledge from ${value}`,
            resolution,
            suggestions: [{ description: "Browse installed Knowledge", cmd: "axm knowledge list" }],
          });
        }),
    }).pipe(withWorkspace(scope), withRuntime("knowledge install")),
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
