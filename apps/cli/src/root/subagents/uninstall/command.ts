import { Argument, Command, Flag } from "effect/unstable/cli";

import { withArgvTracking } from "../../../cli-runtime/index.js";
import { handleUninstall } from "./handler.js";
import { scopeFlag } from "../../../cli-flags/scope-flag.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";

const uninstallConfig = {
  subagent: Argument.string("name").pipe(
    Argument.withDescription("Name of the subagent to uninstall"),
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Uninstall from project (default) or user-level configuration"),
  ),
  preview: previewCapabilityFlag("Show what would be removed without making changes"),
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ subagent, scope, preview }) =>
    handleUninstall({ subagent }, { preview }).pipe(
      withWorkspace(scope),
      withRuntime("subagents uninstall"),
    ),
).pipe(
  withArgvTracking(uninstallConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
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
  ]),
);
