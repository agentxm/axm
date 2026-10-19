import {
  makePerTypeNewCommand,
  runCreateExtensionCommand,
  type NewExtensionArgs,
} from "../shared/create-extension-command.js";

export const handleSubagentsNew = (args: NewExtensionArgs) =>
  runCreateExtensionCommand({
    preview: args.preview,
    request: {
      type: "subagent",
      name: args.name,
      owner: args.owner,
      description: args.description,
    },
    suggestions: (candidate) => [
      { description: `Edit \`${candidate.entryPath}\` to fill in instructions` },
    ],
  });

export const newCommand = makePerTypeNewCommand("subagent", {
  description: "Create a new subagent in the project-workspace authoring root",
  extraConfig: {},
  handle: handleSubagentsNew,
});
