// ==========================================================================
// command.ts — Parent command that composes all skill subcommands
//
// Folder structure mirrors the CLI invocation:
//   root/skills/command.ts  →  axm skills
//   root/skills/list.ts     →  axm skills list
//   root/skills/install.ts  →  axm skills install
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

import { installCommand } from "./install.js";
import { listCommand } from "./list.js";
import { newCommand } from "./new.js";
import { uninstallCommand } from "./uninstall.js";

export const skillsCommand = Command.make("skills").pipe(
  Command.withDescription("Install, list, create, and uninstall skills"),
  Command.withSubcommands([installCommand, uninstallCommand, listCommand, newCommand]),
);
