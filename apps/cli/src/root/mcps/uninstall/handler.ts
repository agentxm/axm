/**
 * `axm mcps uninstall`.
 */

import * as Option from "effect/Option";

import { runUninstallCommand } from "../../shared/uninstall-command.js";

export interface UninstallMcpServerHandlerArgs {
  /** The local connection name to remove. */
  readonly serverName: string;
}

export const handleUninstallMcpServer = (
  args: UninstallMcpServerHandlerArgs,
  flags: { readonly preview: boolean },
) =>
  runUninstallCommand({
    command: "mcps.uninstall",
    preview: flags.preview,
    liveName: "Uninstall MCP server",
    request: {
      type: Option.some("mcp-server"),
      selector: args.serverName,
    },
    recoveryCommand: ["mcps", "uninstall"],
    recoveryPositionals: [args.serverName],
    suggestions: () => [{ description: "Inspect MCP servers", cmd: "axm mcps list" }],
    noOpMessage: () => "No MCP servers uninstalled.",
  });
