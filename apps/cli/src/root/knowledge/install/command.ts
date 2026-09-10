import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command } from "effect/unstable/cli";

import { withArgvTracking } from "../../../cli-runtime/index.js";
import { operationPresentation, type Plan } from "@agentxm/workspace-operations";
import { runInstallCommandWorkflow } from "@agentxm/extension-lifecycle";

import { ignoreReleaseAgeFlag } from "../../../cli-flags/index.js";
import { withReleaseAgePosture, withRuntime, withWorkspace } from "../../../runtime.js";
import { emitOperationResolution } from "../../../operation-output.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
import {
  previewableCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";
import { makeInstallPlanExecution } from "../../shared/confirmation-recovery.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";
import { mutationFlags, scopeConfig } from "../flags.js";
import { InstallKnowledgeCommandWorkflowActions } from "./command-actions.js";

export interface KnowledgeInstallHandlerArgs {
  readonly source: Option.Option<string>;
  readonly preview: boolean;
}

export const handleKnowledgeInstall = (args: KnowledgeInstallHandlerArgs) =>
  withOperationLifecycle(
    {
      command: "knowledge.install",
      mode: args.preview ? "preview" : "apply",
      planName: "Install Knowledge",
    },
    Option.match(args.source, {
      onNone: () =>
        handleWorkspaceInstall({
          command: "knowledge.install",
          type: Option.some("knowledge"),
          planName: "Install Knowledge",
          planDescription: Option.some("Install configured Knowledge bundles"),
          flags: { preview: args.preview },
        }),
      onSome: (value) =>
        Effect.gen(function* () {
          const actions = yield* InstallKnowledgeCommandWorkflowActions;
          const execution = yield* makeInstallPlanExecution(
            { preview: args.preview },
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
            suggestions: [{ description: "Browse installed Knowledge", cmd: "axm knowledge list" }],
          });
        }),
    }),
  );

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Knowledge source (@owner/knowledge/name, path, URL, or git locator)"),
    Argument.optional,
  ),
  ...scopeConfig,
  ...mutationFlags,
  ignoreReleaseAge: ignoreReleaseAgeFlag,
} as const;

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, preview, ignoreReleaseAge }) =>
    handleKnowledgeInstall({ source, preview }).pipe(
      withReleaseAgePosture(ignoreReleaseAge),
      withWorkspace(scope),
      withRuntime("knowledge install"),
    ),
).pipe(
  withArgvTracking(installConfig),
  withCommandCapabilities(previewableCapabilities("workspace", { trust: ["publisher-change"] })),
  Command.withDescription("Install or restore Knowledge bundles"),
  Command.withExamples([
    {
      command: "axm knowledge install @acme/knowledge/platform",
      description: "Install a Knowledge bundle from the registry",
    },
  ]),
);
