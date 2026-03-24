import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { withRuntime } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "../../cli-flags/index.js";
import { handleInstallMcpServer } from "../../cli-commands/mcp-servers/install/handler.js";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WORKSPACE_SCOPES,
  resolveWorkspaceScope,
} from "../../workspace/scope.js";

export const installCommand = Command.make(
  "install",
  {
    source: Argument.string("source").pipe(
      Argument.withDescription(
        "Registry MCP server reference (@profile/mcp-servers/name or bare name)",
      ),
    ),
    scope: Flag.choice("scope", WORKSPACE_SCOPES).pipe(
      Flag.withDescription("Configuration scope: project (default) or user"),
      Flag.withDefault(DEFAULT_WORKSPACE_SCOPE),
    ),
    yes: yesFlag,
    force: forceFlag,
    preview: previewFlag,
  },
  ({ source, scope, yes, force, preview }) =>
    withRuntime(handleInstallMcpServer({ source, scope: resolveWorkspaceScope(scope) }), {
      command: "mcp-servers install",
      workspace: { scope: resolveWorkspaceScope(scope), agents: Option.none() },
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
