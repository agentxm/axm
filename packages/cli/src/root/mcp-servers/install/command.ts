import { Argument, Command, Flag } from "effect/unstable/cli";

import { withRegistryRuntime, withWorkspace } from "../../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags.js";
import { handleInstallMcpServer } from "./handler.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription(
      "Registry MCP server reference (@profile/mcp-servers/name or bare name)",
    ),
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Install to project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip confirmation after reviewing the install plan")),
  force: forceFlag.pipe(Flag.withDescription("Reinstall even if the MCP server already exists")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be installed without making changes"),
  ),
} as const;

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, yes, force, preview }) =>
    handleInstallMcpServer({ source }, { yes, force, preview }).pipe(
      withWorkspace(scope),
      withRegistryRuntime({
        command: "mcp-servers install",
      }),
    ),
).pipe(
  withArgvTracking(installConfig),
  Command.withDescription("Install an MCP server from a registry"),
  Command.withExamples([
    {
      command: "axm mcp-servers install @acme/mcp-servers/my-server",
      description: "Add an MCP server from the registry",
    },
    {
      command: "axm mcp-servers install my-server",
      description: "Install using your default profile",
    },
    {
      command: "axm mcp-servers install @acme/mcp-servers/my-server --preview",
      description: "See what would be installed first",
    },
    { command: "", description: "See also: mcp-servers uninstall" },
  ]),
);
