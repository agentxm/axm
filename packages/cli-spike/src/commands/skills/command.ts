// ==========================================================================
// command.ts — Parent command that composes all skill subcommands
//
// Folder structure mirrors the CLI invocation:
//   commands/skills/command.ts  →  axm skills
//   commands/skills/list.ts     →  axm skills list
//   commands/skills/install.ts  →  axm skills install
//
// Each leaf command (list.ts, install.ts, etc.) exports a single Command.
// This parent has no handler — it just groups subcommands. When invoked
// without a subcommand (e.g. `axm skills`), Effect CLI automatically
// shows help and exits 0.
//
// Command.withSubcommands() composes the tree. The order here determines
// the order in --help output. Auto-generated help includes descriptions
// and examples from each leaf command.
// ==========================================================================
import { Command } from "effect/unstable/cli";

import { disableCommand } from "./disable.js";
import { enableCommand } from "./enable.js";
import { forkCommand } from "./fork.js";
import { installCommand } from "./install.js";
import { listCommand } from "./list.js";
import { newCommand } from "./new.js";
import { publishCommand } from "./publish.js";
import { renameCommand } from "./rename.js";
import { uninstallCommand } from "./uninstall.js";
import { updateCommand } from "./update.js";

export const skillsCommand = Command.make("skills").pipe(
  Command.withDescription("Install, update, and manage skills"),
  Command.withSubcommands([
    installCommand,
    uninstallCommand,
    listCommand,
    newCommand,
    forkCommand,
    publishCommand,
    updateCommand,
    enableCommand,
    disableCommand,
    renameCommand,
  ]),
);
