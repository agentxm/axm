#!/usr/bin/env bun
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import { CliError, Command, GlobalFlag } from "effect/unstable/cli";

import { confirmCommand } from "./dev-cli-commands/tui/confirm/command.js";
import { logCommand } from "./dev-cli-commands/tui/log/command.js";
import { multiselectCommand } from "./dev-cli-commands/tui/multiselect/command.js";
import { noteCommand } from "./dev-cli-commands/tui/note/command.js";
import { passwordInputCommand } from "./dev-cli-commands/tui/password-input/command.js";
import { selectCommand } from "./dev-cli-commands/tui/select/command.js";
import { spinnerCommand } from "./dev-cli-commands/tui/spinner/command.js";
import { textInputCommand } from "./dev-cli-commands/tui/text-input/command.js";

const ROOT_COMMAND = "axm-dev";
const DEV_VERSION = "dev";

type AnyCommand = Command.Command.Any;
type DemoHandler = () => Promise<unknown> | unknown;

const devCliCommandRef: { current: AnyCommand | undefined } = { current: undefined };

interface DevCliExit {
  readonly _tag: "DevCliExit";
  readonly exitCode: number;
}

const devCliExit = (exitCode: number): DevCliExit => ({
  _tag: "DevCliExit",
  exitCode,
});

const isDevCliExit = (error: unknown): error is DevCliExit =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "DevCliExit" &&
  "exitCode" in error &&
  typeof error.exitCode === "number";

const getDevCliCommand = (): AnyCommand => {
  if (devCliCommandRef.current === undefined) {
    throw new Error("Dev CLI command not initialized");
  }

  return devCliCommandRef.current;
};

const runDemo = (handler: DemoHandler) =>
  Effect.promise(async () => {
    await Promise.resolve(handler());
  });

const showHelpFor = (command: AnyCommand, commandPath: ReadonlyArray<string>) =>
  GlobalFlag.Help.run(true, {
    command,
    commandPath,
    version: DEV_VERSION,
  });

const makeLeafCommand = (name: string, description: string, handler: DemoHandler): AnyCommand =>
  Command.make(name, {}, () => runDemo(handler)).pipe(Command.withDescription(description));

const tuiCommand = Command.make("tui", {}, () =>
  Effect.sync(() => {
    console.error("Please specify a TUI component to demo");
  }).pipe(
    Effect.andThen(showHelpFor(getDevCliCommand(), [ROOT_COMMAND, "tui"])),
    Effect.andThen(Effect.fail(devCliExit(1))),
  ),
).pipe(
  Command.withDescription("Demo TUI components"),
  Command.withSubcommands([
    makeLeafCommand("log", "Demo log output variants", logCommand.handler),
    makeLeafCommand("spinner", "Demo spinner animation", spinnerCommand.handler),
    makeLeafCommand("note", "Demo boxed note", noteCommand.handler),
    makeLeafCommand("text-input", "Demo text input", textInputCommand.handler),
    makeLeafCommand("password-input", "Demo password input", passwordInputCommand.handler),
    makeLeafCommand("confirm", "Demo confirm prompt", confirmCommand.handler),
    makeLeafCommand("select", "Demo select prompt", selectCommand.handler),
    makeLeafCommand("multiselect", "Demo multiselect prompt", multiselectCommand.handler),
  ]),
);

const devCliCommand = Command.make(ROOT_COMMAND, {}, () =>
  showHelpFor(getDevCliCommand(), [ROOT_COMMAND]).pipe(Effect.andThen(Effect.fail(devCliExit(1)))),
).pipe(
  Command.withDescription("Dev tools for testing axm components."),
  Command.withExamples([
    { command: "axm-dev tui log", description: "Demo log output variants" },
    { command: "axm-dev tui spinner", description: "Demo spinner animation" },
  ]),
  Command.withSubcommands([tuiCommand]),
);

devCliCommandRef.current = devCliCommand;

export const runDevCli = async (
  args: ReadonlyArray<string> = process.argv.slice(2),
): Promise<void> => {
  try {
    await Effect.runPromise(
      Command.runWith(devCliCommand, { version: DEV_VERSION })(args).pipe(
        Effect.provide(NodeServices.layer),
      ) as Effect.Effect<void>,
    );
  } catch (error) {
    if (isDevCliExit(error)) {
      process.exit(error.exitCode);
    }

    if (CliError.isCliError(error)) {
      process.exit(1);
    }

    console.error(error);
    process.exit(1);
  }
};

void runDevCli();
