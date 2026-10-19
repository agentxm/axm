import {
  makePerTypeNewCommand,
  runCreateExtensionCommand,
  type NewExtensionArgs,
} from "../shared/create-extension-command.js";

export const handlePacksNew = (args: NewExtensionArgs) =>
  runCreateExtensionCommand({
    preview: args.preview,
    request: { type: "pack", name: args.name, owner: args.owner, description: args.description },
    suggestions: (candidate) => [
      { description: `Edit \`${candidate.entryPath}\` to fill in pack contents` },
    ],
  });

export const newCommand = makePerTypeNewCommand("pack", {
  description: "Create a new empty pack in the project-workspace authoring root",
  extraConfig: {},
  handle: handlePacksNew,
});
