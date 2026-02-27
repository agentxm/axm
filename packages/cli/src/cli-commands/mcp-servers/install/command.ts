/**
 * MCP servers install command yargs definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handleInstallMcpServer } from "./handler.js";
import { InstallMcpServerCommandWorkflowActionsLive } from "./command-actions.js";
import { McpServerManagerLive } from "../../../extensions/mcp-servers/manager.js";
import {
  WORKSPACE_SCOPES,
  DEFAULT_WORKSPACE_SCOPE,
  type WorkspaceScope,
  resolveWorkspaceScope,
} from "../../../workspace/scope.js";

interface InstallMcpServerCommandArgs {
  source: string;
  scope: WorkspaceScope;
  yes: boolean;
  force: boolean;
  preview: boolean;
  "non-interactive": boolean | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const installMcpServerCommand: CommandModule<{}, InstallMcpServerCommandArgs> = {
  command: "install <source>",
  describe: "Install an MCP server from a registry",
  builder: (yargs) =>
    yargs
      .positional("source", {
        type: "string",
        describe: "Registry MCP server reference (@namespace/mcp-servers/name or bare name)",
        demandOption: true,
      })
      .option("scope", {
        type: "string",
        choices: WORKSPACE_SCOPES,
        describe: "Configuration scope: project (default) or user",
        default: DEFAULT_WORKSPACE_SCOPE,
      })
      .option("yes", {
        alias: "y",
        type: "boolean",
        describe: "Skip confirmation prompts",
        default: false,
      })
      .option("force", {
        alias: "f",
        type: "boolean",
        describe: "Override constraints that would cause failure",
        default: false,
      })
      .option("preview", {
        type: "boolean",
        describe: "Display installation plan without applying",
        default: false,
      })
      .option("non-interactive", {
        type: "boolean",
        describe: "Disable all interactive prompts",
      })
      .example(
        "$0 mcp-servers install @acme/mcp-servers/my-server",
        "Install an MCP server from registry",
      )
      .example("$0 mcp-servers install my-server", "Install using default namespace"),
  handler: async (argv) => {
    const scope = resolveWorkspaceScope(argv.scope);

    const actionsLayer = Layer.provide(
      InstallMcpServerCommandWorkflowActionsLive,
      McpServerManagerLive,
    );

    const program = handleInstallMcpServer({
      source: argv.source,
      scope,
      yes: argv.yes,
      force: argv.force,
      nonInteractive: Option.fromNullable(argv["non-interactive"]),
    }).pipe(Effect.provide(actionsLayer));

    await run(program, {
      workspace: {
        scope,
        yes: argv.yes,
        nonInteractive: Option.fromNullable(argv["non-interactive"]),
        preview: argv.preview,
        agents: Option.none(),
        force: argv.force,
      },
    });
  },
};
