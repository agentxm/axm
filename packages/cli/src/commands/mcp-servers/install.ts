import { Argument, Command } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { scopeFlag } from "../../cli-flags/index.js";
import { handleInstallMcpServer } from "../../cli-commands/mcp-servers/install/handler.js";

export const installCommand = Command.make(
  "install",
  {
    source: Argument.string("source").pipe(
      Argument.withDescription(
        "Registry MCP server reference (@profile/mcp-servers/name or bare name)",
      ),
    ),
    scope: scopeFlag,
    yes: yesFlag,
    force: forceFlag,
    preview: previewFlag,
  },
  ({ source, scope, yes, force, preview }) =>
    withRuntime(withWorkspace(scope, handleInstallMcpServer({ source })), {
      command: "mcp-servers install",
      flags: { yes, force, preview },
    }),
).pipe(
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
