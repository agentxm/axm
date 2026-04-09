import { Command } from "effect/unstable/cli";

import { loginCommand } from "./login.js";
import { logoutCommand } from "./logout.js";
import { whoamiCommand } from "./whoami.js";
import { tokenCommand } from "./token.js";

export const authCommand = Command.make("auth").pipe(
  Command.withDescription("Manage authentication"),
  Command.withExamples([
    { command: "axm auth login", description: "Sign in to the default registry" },
    { command: "axm auth whoami", description: "Check who you're authenticated as" },
    { command: "axm auth token", description: "Print your auth token for scripting" },
  ]),
  Command.withSubcommands([loginCommand, logoutCommand, whoamiCommand, tokenCommand]),
);
