import { creationOwnerFlag } from "../../cli-flags/owner-handle.js";
import { withParameterDescription } from "../../cli-parameters.js";
import { descriptionFlag } from "../../cli-flags/index.js";
import * as Option from "effect/Option";
import { Argument, Command } from "effect/cli";

import {
  decodeExtensionNameSync,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";

import { withArgvTracking } from "../../cli-runtime/index.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { runCreateExtensionCommand } from "../shared/create-extension-command.js";

export interface SkillsNewHandlerArgs {
  readonly name: ExtensionName;
  readonly owner: Option.Option<string>;
  readonly description?: Option.Option<string>;
  readonly preview: boolean;
}

export const handleSkillsNew = (args: SkillsNewHandlerArgs) =>
  runCreateExtensionCommand({
    command: "skills.new",
    preview: args.preview,
    request: {
      type: "skill",
      name: args.name,
      owner: args.owner,
      description: args.description ?? Option.none(),
    },
    suggestions: (candidate) => [
      { description: `Edit \`${candidate.entryPath}\` to fill in instructions` },
    ],
  });

const newConfig = {
  name: Argument.String("name").pipe(
    withParameterDescription("Name of the skill to create, without owner"),
  ),
  owner: creationOwnerFlag,
  description: descriptionFlag,
  preview: previewCapabilityFlag(),
} as const;

export const newCommand = Command.make("new", newConfig, ({ name, owner, description, preview }) =>
  handleSkillsNew({
    name: decodeExtensionNameSync(name),
    owner,
    description,
    preview,
  }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime("skills new")),
).pipe(
  withArgvTracking(newConfig),
  withCommandCapabilities(previewableCapabilities("authored-source")),
  Command.withDescription("Create a new skill in the project-workspace authoring root"),
  Command.withExamples([
    { command: "axm skills new my-skill", description: "Scaffold a new skill" },
    {
      command: "axm skills new my-skill --owner @acme",
      description: "Create under a specific owner",
    },
  ]),
);
