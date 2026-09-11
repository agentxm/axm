import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import {
  KNOWLEDGE_MANIFEST_FILENAME,
  KNOWLEDGE_SOURCE_DIR,
} from "@agentxm/extension-model/unstable/knowledge";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";

import { withArgvTracking } from "../../cli-runtime/index.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { runCreateExtensionCommand } from "../shared/create-extension-command.js";

export interface KnowledgeNewHandlerArgs {
  readonly name: string;
  readonly owner: Option.Option<string>;
  readonly description: Option.Option<string>;
  readonly preview: boolean;
}

export const handleKnowledgeNew = (args: KnowledgeNewHandlerArgs) =>
  runCreateExtensionCommand({
    command: "knowledge.new",
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
              description: `Add a concise bundle description to \`${candidate.authoredPath}/${KNOWLEDGE_MANIFEST_FILENAME}\``,
            },
          ]
        : []),
      {
        description: `Add typed Markdown concepts below \`${candidate.authoredPath}/${KNOWLEDGE_SOURCE_DIR}\``,
      },
      { description: "Replace the root index placeholder with grouped, annotated concept links" },
    ],
  });

const newConfig = {
  name: Argument.String("name").pipe(
    Argument.withDescription("Name of the knowledge bundle (without owner)"),
  ),
  owner: Flag.String("owner").pipe(
    Flag.withDescription(
      "Owner to create under; recorded as the workspace owner when none is set (e.g., @acme)",
    ),
    Flag.optional,
  ),
  description: Flag.String("description").pipe(
    Flag.withDescription("Concise bundle-level discovery summary"),
    Flag.optional,
  ),
  preview: previewCapabilityFlag("Show what would be created without writing files"),
} as const;

export const newCommand = Command.make("new", newConfig, ({ name, owner, description, preview }) =>
  handleKnowledgeNew({ name, owner, description, preview }).pipe(
    withWorkspace(DEFAULT_WORKSPACE_SCOPE),
    withRuntime("knowledge new"),
  ),
).pipe(
  withArgvTracking(newConfig),
  withCommandCapabilities(previewableCapabilities("authored-source")),
  Command.withDescription(
    "Create an Open Knowledge Format bundle in the project-workspace authoring root",
  ),
  Command.withExamples([
    {
      command: "axm knowledge new platform",
      description: "Create a new OKF knowledge bundle",
    },
    {
      command: "axm knowledge new platform --owner @acme",
      description: "Create a bundle under a specific owner",
    },
  ]),
);
