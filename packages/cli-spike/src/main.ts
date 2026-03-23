#!/usr/bin/env bun
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import { CliError, Command, Flag, GlobalFlag } from "effect/unstable/cli";

import { skillsCommand } from "./commands/skills/command.js";

// ---------------------------------------------------------------------------
// Global flags — available to every command in the tree
// ---------------------------------------------------------------------------

const nonInteractiveFlag = GlobalFlag.setting("spike-non-interactive")({
  flag: Flag.boolean("non-interactive").pipe(
    Flag.optional,
    Flag.withDescription("Disable all interactive prompts"),
  ),
});

const yesFlag = GlobalFlag.setting("spike-yes")({
  flag: Flag.boolean("yes").pipe(
    Flag.withAlias("y"),
    Flag.withDescription("Auto-accept confirmation prompts"),
  ),
});

const forceFlag = GlobalFlag.setting("spike-force")({
  flag: Flag.boolean("force").pipe(
    Flag.withAlias("f"),
    Flag.withDescription("Override constraints that would cause failure"),
  ),
});

const previewFlag = GlobalFlag.setting("spike-preview")({
  flag: Flag.boolean("preview").pipe(Flag.withDescription("Display plan without applying")),
});

const globalFlags = [nonInteractiveFlag, yesFlag, forceFlag, previewFlag] as const;

// ---------------------------------------------------------------------------
// Root command
// ---------------------------------------------------------------------------

const ROOT_COMMAND = "axm-spike";
const VERSION = "0.0.1";

const rootCommand = Command.make(ROOT_COMMAND).pipe(
  Command.withDescription("Effect v4 CLI spike — proving out idiomatic command/flag patterns."),
  Command.withExamples([
    { command: "axm-spike skills list", description: "List installed skills" },
    { command: "axm-spike skills install owner/repo", description: "Install skills from GitHub" },
  ]),
  Command.withSubcommands([skillsCommand]),
  Command.withGlobalFlags(globalFlags),
);

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const run = async (args: ReadonlyArray<string> = process.argv.slice(2)): Promise<void> => {
  try {
    await Effect.runPromise(
      Command.runWith(rootCommand, { version: VERSION })(args).pipe(
        Effect.provide(NodeServices.layer),
      ) as Effect.Effect<void>,
    );
  } catch (error) {
    if (CliError.isCliError(error)) {
      process.exit(1);
    }
    console.error(error);
    process.exit(1);
  }
};

void run();
