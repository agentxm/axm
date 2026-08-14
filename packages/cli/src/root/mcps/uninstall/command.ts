import { Argument, Command, Flag } from "effect/unstable/cli";

import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { handleUninstallMcpServer } from "./handler.js";
import { scopeFlag } from "../../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";

const uninstallConfig = {
  name: Argument.string("name").pipe(
    Argument.withDescription("Name of the MCP server to uninstall"),
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
  ({ name, scope, yes, preview }) =>
    handleUninstallMcpServer({ serverName: name }, { yes, preview }).pipe(
      withWorkspace(scope),
      withRuntime("mcps uninstall"),
    ),
).pipe(
  withArgvTracking(uninstallConfig),
  Command.withDescription("Uninstall an MCP server"),
  Command.withExamples([
    {
      command: "axm mcps uninstall my-server",
      description: "Remove an MCP server you no longer need",
    },
    {
      command: "axm mcps uninstall my-server --preview",
      description: "Check what would be removed first",
    },
    {
      command: "axm mcps uninstall my-server --yes",
      description: "Remove without confirmation (scripts/CI)",
    },
  ]),
);
