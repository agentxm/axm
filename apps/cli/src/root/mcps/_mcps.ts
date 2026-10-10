import { Command } from "effect/cli";

import { LearnMore, formatLearnMore } from "../../formatter.js";
import { groupCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { makeExtensionShowCommand } from "../shared/extension-show.js";
import { adoptCommand } from "./adopt.js";
import { addCommand } from "./add.js";
import { makeActivationCommands } from "../activation-handler.js";
import { importCommand } from "./import.js";
import { mcpsInstallCommand as installCommand } from "../install/command.js";
import { listCommand } from "./list.js";
import { newCommand } from "./new.js";
import { mcpsPublishCommand as publishCommand } from "../publish/per-type-command.js";
import { makePerTypeUninstallCommand } from "../shared/uninstall-command.js";
import { makePerTypeUpdateCommand } from "../update/per-type-command.js";

const updateCommand = makePerTypeUpdateCommand("mcp-server");

const uninstallCommand = makePerTypeUninstallCommand("mcp-server");

const { enableCommand, disableCommand } = makeActivationCommands("mcp-server");

const showCommand = makeExtensionShowCommand({
  type: "mcp-server",
  group: "mcps",
  exampleName: "linear",
});

export const mcpsCommand = Command.make("mcps").pipe(
  Command.withDescription("Manage MCP servers"),
  withCommandCapabilities(groupCapabilities),
  Command.annotate(
    LearnMore,
    formatLearnMore([
      ["axm help mcps", "Managing MCP server extensions with AXM"],
      ["axm help mcp-schema", "Print the MCP server manifest JSON Schema"],
    ]),
  ),
  Command.withExamples([
    {
      command: "axm mcps install @acme/mcps/my-server",
      description: "Add an MCP server from the registry",
    },
    {
      command: "axm mcps uninstall my-server",
      description: "Remove an MCP server",
    },
  ]),
  Command.withSubcommands([
    {
      group: "MANAGE MCPS",
      commands: [
        installCommand,
        updateCommand,
        uninstallCommand,
        listCommand,
        showCommand,
        enableCommand,
        disableCommand,
        addCommand,
        adoptCommand,
      ],
    },
    {
      group: "AUTHOR MCPS",
      commands: [newCommand, importCommand, publishCommand],
    },
  ]),
);
