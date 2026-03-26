import { Command } from "effect/unstable/cli";

import { showHelpFor } from "../../help.js";
import { loginCommand } from "./login/command.js";
import { logoutCommand } from "./logout/command.js";
import { whoamiCommand } from "./whoami/command.js";
import { tokenCommand } from "./token/command.js";

export const authCommand = Command.make("auth", {}, () => showHelpFor(["axm", "auth"])).pipe(
  Command.withDescription("Manage authentication"),
  Command.withExamples([
    { command: "axm auth login", description: "Sign in to the default registry" },
    { command: "axm auth whoami", description: "Show the current authenticated identity" },
  ]),
  Command.withSubcommands([loginCommand, logoutCommand, whoamiCommand, tokenCommand]),
);
