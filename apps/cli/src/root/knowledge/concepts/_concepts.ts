import { Command } from "effect/cli";

import { groupCapabilities, withCommandCapabilities } from "../../shared/command-capabilities.js";
import { getCommand } from "./get.js";
import { queryCommand } from "./query.js";
import { relatedCommand } from "./related.js";
import { resolveCommand } from "./resolve.js";
import { capabilitiesCommand } from "./capabilities.js";

export const conceptsCommand = Command.make("concepts").pipe(
  Command.withDescription("Discover installed knowledge concepts through versioned identities"),
  withCommandCapabilities(groupCapabilities),
  Command.withExamples([
    {
      command: 'axm knowledge concepts query "authentication"',
      description: "Search the selected installed knowledge corpus",
    },
  ]),
  Command.withSubcommands([
    resolveCommand,
    queryCommand,
    getCommand,
    relatedCommand,
    capabilitiesCommand,
  ]),
);
