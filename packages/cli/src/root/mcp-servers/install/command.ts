import { Argument, Command, Flag } from "effect/unstable/cli";

import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags.js";
import { handleInstallMcpServer } from "./handler.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription(
      "Registry MCP server reference (@owner/mcp-servers/name or bare name)",
    ),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Install to project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip confirmation after reviewing the install plan")),
  force: forceFlag.pipe(Flag.withDescription("Reinstall even if the MCP server already exists")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be installed without making changes"),
  ),
  env: Flag.optional(Flag.string("env")).pipe(
    Flag.withAlias("e"),
    Flag.withDescription("Provide an MCP input value as KEY=VALUE"),
  ),
  nonInteractive: Flag.boolean("non-interactive").pipe(
    Flag.withDescription("Use defaults and placeholders instead of prompting for MCP inputs"),
  ),
} as const;

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, yes, force, preview, env, nonInteractive }) =>
    handleInstallMcpServer({ source, env, nonInteractive }, { yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("mcp-servers install"),
    ),
).pipe(
  withArgvTracking(installConfig),
  Command.withDescription(
    "Reinstall configured MCP servers from their sources, or install an MCP server from a registry",
  ),
  Command.withExamples([
    {
      command: "axm mcp-servers install",
      description: "Reinstall all configured MCP servers from their sources",
    },
    {
      command: "axm mcp-servers install @acme/mcp-servers/my-server",
      description: "Add an MCP server from the registry",
    },
    {
      command: "axm mcp-servers install my-server",
      description: "Install using your default owner",
    },
    {
      command: "axm mcp-servers install @acme/mcp-servers/my-server --preview",
      description: "See what would be installed first",
    },
  ]),
);
