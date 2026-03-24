import * as Effect from "effect/Effect";
import { Command, GlobalFlag } from "effect/unstable/cli";

import { loadVersion } from "./version.js";

type AnyCommand = Command.Command.Any;

const rootCommandRef: { current: AnyCommand | undefined } = { current: undefined };

export const setRootCommand = (command: AnyCommand): void => {
  rootCommandRef.current = command;
};

export const showHelpFor = (commandPath: ReadonlyArray<string>) =>
  Effect.suspend(() => {
    const command = rootCommandRef.current;
    if (command === undefined) {
      return Effect.die(new Error("CLI command not initialized"));
    }

    return GlobalFlag.Help.run(true, {
      command,
      commandPath,
      version: loadVersion(),
    });
  });
