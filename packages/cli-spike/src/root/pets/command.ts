// ==========================================================================
// command.ts — Parent command that composes all pet subcommands
//
// Folder structure mirrors the CLI invocation:
//   root/pets/command.ts  →  axm pets
//   root/pets/list.ts     →  axm pets list
//   root/pets/intake.ts   →  axm pets intake
//
// Each leaf command (list.ts, intake.ts, etc.) exports a single Command.
// This parent has no handler — it just groups subcommands. When invoked
// without a subcommand (e.g. `axm pets`), Effect CLI automatically
// shows help and exits 0.
//
// Command.withSubcommands() composes the tree. The order here determines
// the order in --help output. Auto-generated help includes descriptions
// and examples from each leaf command.
// ==========================================================================
import { Command } from "effect/unstable/cli";

import { adoptCommand } from "./adopt.js";
import { intakeCommand } from "./intake.js";
import { listCommand } from "./list.js";
import { registerCommand } from "./register.js";

export const petsCommand = Command.make("pets").pipe(
  Command.withDescription("List, intake, register, and adopt sample pets"),
  Command.withSubcommands([listCommand, intakeCommand, registerCommand, adoptCommand]),
);
