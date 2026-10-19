import {
  makePerTypeNewCommand,
  runCreateExtensionCommand,
  type NewExtensionArgs,
} from "../shared/create-extension-command.js";

export const handleSkillsNew = (args: NewExtensionArgs) =>
  runCreateExtensionCommand({
    preview: args.preview,
    request: { type: "skill", name: args.name, owner: args.owner, description: args.description },
    suggestions: (candidate) => [
      { description: `Edit \`${candidate.entryPath}\` to fill in instructions` },
    ],
  });

export const newCommand = makePerTypeNewCommand("skill", {
  description: "Create a new skill in the project-workspace authoring root",
  extraConfig: {},
  handle: handleSkillsNew,
});
