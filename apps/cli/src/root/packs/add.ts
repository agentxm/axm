import { withParameterDescription } from "../../cli-parameters.js";
import { Argument, Command } from "effect/cli";

import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";

import { withArgvTracking } from "../../cli-runtime/index.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { runPackMembershipCommand } from "./membership-command.js";

export interface PacksAddHandlerArgs {
  readonly pack: string;
  readonly extension: string;
  readonly preview: boolean;
}

export const handlePacksAdd = (args: PacksAddHandlerArgs) =>
  runPackMembershipCommand({
    preview: args.preview,
    request: { change: "add", pack: args.pack, selector: args.extension },
  });

const addConfig = {
  pack: Argument.String("name").pipe(
    withParameterDescription("Configured pack name or unique configured pack FQN"),
  ),
  extension: Argument.String("extension").pipe(
    withParameterDescription("Installed extension FQN, name, or glob over names"),
  ),
  preview: previewCapabilityFlag(),
} as const;

export const addCommand = Command.make("add", addConfig, ({ pack, extension, preview }) =>
  handlePacksAdd({ pack, extension, preview }).pipe(
    withWorkspace(DEFAULT_WORKSPACE_SCOPE),
    withRuntime("packs add"),
  ),
).pipe(
  withArgvTracking(addConfig),
  withCommandCapabilities(previewableCapabilities("authored-source")),
  Command.withDescription("Add an extension to a project-workspace pack manifest"),
  Command.withExamples([
    {
      command: "axm packs add frontend-tools @acme/skills/code-review",
      description: "Bundle a skill into your pack",
    },
    {
      command: 'axm packs add my-pack "effect-*"',
      description: "Add multiple extensions by pattern",
    },
  ]),
);
