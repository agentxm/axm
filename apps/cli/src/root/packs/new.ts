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

export interface PacksNewHandlerArgs {
  readonly name: ExtensionName;
  readonly owner: Option.Option<string>;
  readonly description?: Option.Option<string>;
  readonly preview: boolean;
}

export const handlePacksNew = (args: PacksNewHandlerArgs) =>
  runCreateExtensionCommand({
    command: "packs.new",
    preview: args.preview,
    request: {
      type: "pack",
      name: args.name,
      owner: args.owner,
      description: args.description ?? Option.none(),
    },
    suggestions: (candidate) => [
      { description: `Edit \`${candidate.entryPath}\` to fill in pack contents` },
    ],
  });

const newConfig = {
  name: Argument.String("name").pipe(
    withParameterDescription("Name of the pack to create, without owner"),
  ),
  owner: creationOwnerFlag,
  description: descriptionFlag,
  preview: previewCapabilityFlag(),
} as const;

export const newCommand = Command.make("new", newConfig, ({ name, owner, description, preview }) =>
  handlePacksNew({
    name: decodeExtensionNameSync(name),
    owner,
    description,
    preview,
  }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime("packs new")),
).pipe(
  withArgvTracking(newConfig),
  withCommandCapabilities(previewableCapabilities("authored-source")),
  Command.withDescription("Create a new empty pack in the project-workspace authoring root"),
  Command.withExamples([
    {
      command: "axm packs new frontend-tools",
      description: "Create an empty pack to bundle extensions",
    },
    {
      command: "axm packs new frontend-tools --owner @co",
      description: "Create under a specific owner",
    },
  ]),
);
