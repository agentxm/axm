import { Command } from "effect/unstable/cli";

import { LearnMore, formatLearnMore } from "../../formatter.js";
import { makeExtensionShowCommand } from "../shared/extension-show.js";
import { mcpsVersionCommand } from "../shared/version-command.js";
import { addCommand } from "./add.js";
import { disableCommand } from "./disable.js";
import { enableCommand } from "./enable.js";
import { importCommand } from "./import.js";
import { installCommand } from "./install/command.js";
import { listCommand } from "./list.js";
import { newCommand } from "./new.js";
import { mcpsPublishCommand as publishCommand } from "../publish/per-type-command.js";
import { uninstallCommand } from "./uninstall/command.js";
import { updateCommand } from "./update.js";

const showCommand = makeExtensionShowCommand({
  type: "mcp-server",
  group: "mcps",
  exampleName: "linear",
});

export const mcpsCommand = Command.make("mcps").pipe(
  Command.withDescription("Manage MCP servers"),
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
    {
      command: "axm mcps version @acme/mcps/my-server patch",
      description: "Bump an MCP server version",
    },
  ]),
  Command.withSubcommands([
    addCommand,
    importCommand,
    installCommand,
    uninstallCommand,
    showCommand,
    listCommand,
    enableCommand,
    disableCommand,
    updateCommand,
    newCommand,
    publishCommand,
    mcpsVersionCommand,
  ]),
);
