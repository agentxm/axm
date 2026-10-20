import * as Option from "effect/Option";
import { Flag } from "effect/cli";

import { withParameterDescription } from "../../cli-parameters.js";
import {
  makePerTypeNewCommand,
  runCreateExtensionCommand,
  type NewExtensionArgs,
} from "../shared/create-extension-command.js";

const handleRulesNew = (args: NewExtensionArgs & { readonly title: Option.Option<string> }) =>
  runCreateExtensionCommand({
    preview: args.preview,
    request: {
      type: "rule",
      name: args.name,
      owner: args.owner,
      title: args.title,
      description: args.description,
    },
    suggestions: (candidate) => [
      { description: `Write the rule body in \`${candidate.entryPath}\`` },
    ],
  });

export const newCommand = makePerTypeNewCommand("rule", {
  description: "Create a new rule in the project-workspace authoring root",
  extraConfig: {
    title: Flag.String("title").pipe(
      withParameterDescription("Display title for the rule"),
      Flag.optional,
    ),
  },
  handle: handleRulesNew,
});
