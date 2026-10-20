import * as Option from "effect/Option";

import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";
import { KNOWLEDGE_SOURCE_DIR } from "@agentxm/extension-model/unstable/knowledge";

import {
  makePerTypeNewCommand,
  runCreateExtensionCommand,
  type NewExtensionArgs,
} from "../shared/create-extension-command.js";

const handleKnowledgeNew = (args: NewExtensionArgs) =>
  runCreateExtensionCommand({
    preview: args.preview,
    request: {
      type: "knowledge",
      name: args.name,
      owner: args.owner,
      description: args.description,
    },
    suggestions: (candidate) => [
      ...(Option.isNone(args.description)
        ? [
            {
              description: `Add a concise bundle description to \`${candidate.authoredPath}/${manifestFilenameForType("knowledge")}\``,
            },
          ]
        : []),
      {
        description: `Add typed Markdown concepts below \`${candidate.authoredPath}/${KNOWLEDGE_SOURCE_DIR}\``,
      },
      { description: "Replace the root index placeholder with grouped, annotated concept links" },
    ],
  });

export const newCommand = makePerTypeNewCommand("knowledge", {
  description: "Create an Open Knowledge Format bundle in the project-workspace authoring root",
  extraConfig: {},
  handle: handleKnowledgeNew,
});
