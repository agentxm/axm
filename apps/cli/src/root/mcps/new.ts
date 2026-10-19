import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Screen } from "../../screen/index.js";
import {
  makePerTypeNewCommand,
  runCreateExtensionCommand,
  type NewExtensionArgs,
} from "../shared/create-extension-command.js";

export const handleMcpServersNew = (args: NewExtensionArgs) =>
  Effect.gen(function* () {
    const nonInteractive = !(yield* (yield* Screen).canAsk);
    return yield* runCreateExtensionCommand({
      preview: args.preview,
      request: {
        type: "mcp-server",
        name: args.name,
        owner: args.owner,
        description: Option.filter(args.description, (description) => description.length > 0),
        nonInteractive,
      },
      suggestions: (candidate) => [
        { description: `Edit \`${candidate.entryPath}\` to configure the MCP server` },
      ],
    });
  });

export const newCommand = makePerTypeNewCommand("mcp-server", {
  description: "Create a new MCP server in the project-workspace authoring root",
  extraConfig: {},
  examples: [
    {
      command: "axm mcps new context --preview",
      description: "Preview the files that would be created",
    },
  ],
  handle: handleMcpServersNew,
});
