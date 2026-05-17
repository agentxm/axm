import { Command } from "effect/unstable/cli";

import { LearnMore, formatLearnMore } from "../../formatter.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { addCommand } from "./add.js";
import { handleAgentsList, listCommand } from "./list.js";
import { removeCommand } from "./remove.js";

export const agentsCommand = Command.make("agents", {}, () =>
  handleAgentsList({ detected: false, available: false }).pipe(
    withWorkspace("project"),
    withRuntime("agents"),
  ),
).pipe(
  Command.withDescription("Manage coding-agent harnesses configured for AXM"),
  Command.annotate(
    LearnMore,
    formatLearnMore([
      ["axm agents list", "Show coding-agent harnesses configured for this workspace"],
      ["axm agents add <id>", "Configure another coding-agent harness"],
      ["axm agents remove <id>", "Remove a coding-agent harness from AXM management"],
    ]),
  ),
  Command.withExamples([
    { command: "axm agents", description: "Show configured and detected coding agents" },
    { command: "axm agents add cursor", description: "Add Cursor to a configured workspace" },
    { command: "axm agents remove cursor", description: "Stop syncing into Cursor" },
  ]),
  Command.withSubcommands([listCommand, addCommand, removeCommand]),
);
