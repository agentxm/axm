import * as Effect from "effect/Effect";
import { Argument, Command } from "effect/unstable/cli";

import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { runUninstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { emitAppliedPlanOutcome } from "../../shared/applied-plan-output.js";
import {
  deleteSourceFlag,
  keepSourceFlag,
  resolveSourceDisposition,
} from "../../shared/source-disposition-flags.js";
import { mutationFlags, scopeConfig } from "../flags.js";
import { makeUninstallKnowledgeCommandWorkflowActions } from "./command-actions.js";

const uninstallConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Configured Knowledge bundle name")),
  ...scopeConfig,
  ...mutationFlags,
  keepSource: keepSourceFlag,
  deleteSource: deleteSourceFlag,
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ name, scope, yes, preview, keepSource, deleteSource }) =>
    Effect.gen(function* () {
      const sourceDisposition = yield* resolveSourceDisposition(keepSource, deleteSource);
      const actions = yield* makeUninstallKnowledgeCommandWorkflowActions;
      const resolution = yield* runUninstallCommandWorkflow({ name }, actions, {
        yes,
        preview,
        displayApplied: false,
        ...(sourceDisposition === undefined ? {} : { sourceDisposition }),
      });
      yield* emitAppliedPlanOutcome({
        command: "knowledge.uninstall",
        headline: `Uninstalled Knowledge bundle ${name}`,
        resolution,
        suggestions: [{ description: "Browse installed Knowledge", cmd: "axm knowledge list" }],
      });
    }).pipe(withWorkspace(scope), withRuntime("knowledge uninstall")),
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
