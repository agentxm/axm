import { Argument, Command, Flag } from "effect/unstable/cli";

import { previewFlag, reinstallFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags.js";
import { handleInstallMcpServer } from "./handler.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Registry MCP server reference (@owner/mcps/name or bare name)"),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Install to project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip confirmation after reviewing the install plan")),
  force: reinstallFlag.pipe(Flag.withDescription("Reinstall an MCP server that already exists")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be installed without making changes"),
  ),
  env: Flag.string("env").pipe(
    Flag.withAlias("e"),
    Flag.withDescription("Provide an MCP input value as KEY=VALUE; repeatable"),
    Flag.atLeast(0),
  ),
} as const;

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, yes, force, preview, env }) =>
    handleInstallMcpServer({ source, env }, { yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("mcps install"),
    ),
).pipe(
  withArgvTracking(installConfig),
  Command.withDescription(
    "Reinstall configured MCP servers from their sources, or install an MCP server from a registry",
  ),
  Command.withExamples([
    {
      command: "axm mcps install",
      description: "Reinstall all configured MCP servers from their sources",
    },
    {
      command: "axm mcps install @acme/mcps/my-server",
      description: "Add an MCP server from the registry",
    },
    {
      command: "axm mcps install my-server",
      description: "Install using your default owner",
    },
    {
      command: "axm mcps install @acme/mcps/my-server --preview",
      description: "See what would be installed first",
    },
    {
      command: "axm mcps install @acme/mcps/my-server --env API_KEY=abc --env REGION=us",
      description: "Supply multiple MCP input values",
    },
  ]),
);
