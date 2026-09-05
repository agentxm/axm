import { Command } from "effect/unstable/cli";

import { LearnMore, formatLearnMore } from "../../formatter.js";
import { addCommand } from "./add.js";
import { capabilitiesCommand } from "./capabilities.js";
import { listCommand } from "./list.js";
import { removeCommand } from "./remove.js";

export const agentsCommand = Command.make("agents").pipe(
  Command.withDescription("Manage coding-agent harnesses configured for AXM"),
  Command.annotate(
    LearnMore,
    formatLearnMore([
      ["axm agents list", "Show coding-agent harnesses configured for this workspace"],
      ["axm agents add <id>", "Configure another coding-agent harness"],
      ["axm agents remove <id>", "Remove a coding-agent harness from AXM management"],
      ["axm agents capabilities <id>", "Show what one coding agent supports"],
      ["axm rules", "Inspect and manage workspace instruction files"],
    ]),
  ),
  Command.withExamples([
    { command: "axm agents list", description: "Show configured and detected coding agents" },
    { command: "axm agents add cursor", description: "Add Cursor to a configured workspace" },
    { command: "axm agents remove cursor", description: "Stop syncing into Cursor" },
  ]),
  Command.withSubcommands([listCommand, addCommand, removeCommand, capabilitiesCommand]),
);
