import { Argument, Command } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags/index.js";
import { handleInstallMcpServer } from "./handler.js";

const installConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription(
      "Registry MCP server reference (@profile/mcp-servers/name or bare name)",
    ),
  ),
  scope: scopeFlag,
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const installCommand = Command.make(
  "install",
  installConfig,
  ({ source, scope, yes, force, preview }) =>
    withRuntime(withWorkspace(scope, handleInstallMcpServer({ source }, { yes, force, preview })), {
      command: "mcp-servers install",
    }),
).pipe(
  withArgvTracking(installConfig),
  Command.withDescription("Install an MCP server from a registry"),
  Command.withExamples([
    {
      command: "axm mcp-servers install @acme/mcp-servers/my-server",
      description: "Install an MCP server from the registry",
    },
    {
      command: "axm mcp-servers install my-server",
      description: "Install using the default profile",
    },
  ]),
);
