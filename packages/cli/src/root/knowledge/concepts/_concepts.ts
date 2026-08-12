import { Command } from "effect/unstable/cli";

import { getCommand } from "./get.js";
import { queryCommand } from "./query.js";
import { relatedCommand } from "./related.js";
import { resolveCommand } from "./resolve.js";
import { searchCommand } from "./search.js";
import { statusCommand } from "./status.js";

export const conceptsCommand = Command.make("concepts").pipe(
  Command.withDescription("Discover installed knowledge concepts through versioned identities"),
  Command.withExamples([
    {
      command: 'axm knowledge concepts search "authentication"',
      description: "Search the selected installed knowledge corpus",
    },
  ]),
  Command.withSubcommands([
    resolveCommand,
    searchCommand,
    queryCommand,
    getCommand,
    relatedCommand,
    statusCommand,
  ]),
);
