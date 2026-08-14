import { Argument, Command, Flag } from "effect/unstable/cli";

import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { handleUninstall } from "./handler.js";
import { scopeFlag } from "../../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";

const uninstallConfig = {
  subagent: Argument.string("subagent").pipe(
    Argument.withDescription("Name of the subagent to uninstall"),
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Uninstall from project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip the 'are you sure?' confirmation")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be removed without making changes"),
  ),
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ subagent, scope, yes, preview }) =>
    handleUninstall({ subagent }, { yes, preview }).pipe(
      withWorkspace(scope),
      withRuntime("subagents uninstall"),
    ),
).pipe(
  withArgvTracking(uninstallConfig),
  Command.withDescription("Uninstall a subagent from agents"),
  Command.withExamples([
    {
      command: "axm subagents uninstall my-subagent",
      description: "Remove a subagent you no longer need",
    },
    {
      command: "axm subagents uninstall my-subagent --preview",
      description: "Check what would be removed first",
    },
    {
      command: "axm subagents uninstall my-subagent --yes",
      description: "Remove without confirmation (scripts/CI)",
    },
  ]),
);
