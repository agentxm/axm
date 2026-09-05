import { Argument, Command, Flag } from "effect/unstable/cli";

import { withArgvTracking } from "../../../cli-runtime/index.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";
import { handleUninstallMcpServer } from "./handler.js";
import { scopeFlag } from "../../../cli-flags/scope-flag.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";

const uninstallConfig = {
  name: Argument.string("name").pipe(
    Argument.withDescription("Name of the MCP server to uninstall"),
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Uninstall from project (default) or user-level configuration"),
  ),
  preview: previewCapabilityFlag("Show what would be removed without making changes"),
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ name, scope, preview }) =>
    handleUninstallMcpServer({ serverName: name }, { preview }).pipe(
      withWorkspace(scope),
      withRuntime("mcps uninstall"),
    ),
).pipe(
  withArgvTracking(uninstallConfig),
  withCommandCapabilities(previewableCapabilities("workspace")),
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
  ]),
);
