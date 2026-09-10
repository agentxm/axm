import { Argument, Command } from "effect/unstable/cli";

import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";

import { withArgvTracking } from "../../cli-runtime/index.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { runPackMembershipCommand } from "./membership-command.js";

export interface PacksRemoveHandlerArgs {
  readonly pack: string;
  readonly extension: string;
  readonly preview: boolean;
}

export const handlePacksRemove = (args: PacksRemoveHandlerArgs) =>
  runPackMembershipCommand({
    preview: args.preview,
    request: { change: "remove", pack: args.pack, selector: args.extension },
  });

const removeConfig = {
  pack: Argument.string("name").pipe(
    Argument.withDescription("Configured pack name or unique configured pack FQN"),
  ),
  extension: Argument.string("extension").pipe(
    Argument.withDescription("Extension name or glob pattern"),
  ),
  preview: previewCapabilityFlag("Show what would change in the manifest without modifying it"),
} as const;

export const removeCommand = Command.make("remove", removeConfig, ({ pack, extension, preview }) =>
  handlePacksRemove({ pack, extension, preview }).pipe(
    withWorkspace(DEFAULT_WORKSPACE_SCOPE),
    withRuntime("packs remove"),
  ),
).pipe(
  withArgvTracking(removeConfig),
  withCommandCapabilities(previewableCapabilities("authored-source")),
  Command.withDescription("Remove an extension from a project-workspace pack manifest"),
  Command.withExamples([
    {
      command: "axm packs remove frontend-tools @acme/skills/code-review",
      description: "Remove an extension from a pack",
    },
    {
      command: 'axm packs remove my-pack "@acme/effect-*"',
      description: "Remove by pattern",
    },
  ]),
);
