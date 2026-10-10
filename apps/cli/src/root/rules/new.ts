import { creationOwnerFlag } from "../../cli-flags/owner-handle.js";
import { withParameterDescription } from "../../cli-parameters.js";
import { descriptionFlag } from "../../cli-flags/index.js";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/cli";

import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/extension-model/unstable/workspace-scope";

import { withArgvTracking } from "../../cli-runtime/index.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  previewCapabilityFlag,
  previewableCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { runCreateExtensionCommand } from "../shared/create-extension-command.js";

export interface RulesNewHandlerArgs {
  readonly name: string;
  readonly owner: Option.Option<string>;
  readonly title: Option.Option<string>;
  readonly description?: Option.Option<string>;
  readonly preview: boolean;
}

export const handleRulesNew = (args: RulesNewHandlerArgs) =>
  runCreateExtensionCommand({
    command: "rules.new",
    preview: args.preview,
    request: {
      type: "rule",
      name: args.name,
      owner: args.owner,
      title: args.title,
      description: args.description ?? Option.none(),
    },
    suggestions: (candidate) => [
      { description: `Write the rule body in \`${candidate.entryPath}\`` },
    ],
  });

const newConfig = {
  name: Argument.String("name").pipe(
    withParameterDescription("Name of the rule to create, without owner"),
  ),
  owner: creationOwnerFlag,
  title: Flag.String("title").pipe(
    withParameterDescription("Display title for the rule"),
    Flag.optional,
  ),
  description: descriptionFlag,
  preview: previewCapabilityFlag(),
} as const;

export const newCommand = Command.make(
  "new",
  newConfig,
  ({ name, owner, title, description, preview }) =>
    handleRulesNew({ name, owner, title, description, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withRuntime("rules new"),
    ),
).pipe(
  withArgvTracking(newConfig),
  withCommandCapabilities(previewableCapabilities("authored-source")),
  Command.withDescription("Create a new rule in the project-workspace authoring root"),
  Command.withExamples([
    { command: "axm rules new commit-style", description: "Scaffold a new rule" },
    {
      command: "axm rules new commit-style --owner @acme",
      description: "Create a rule under a specific owner",
    },
  ]),
);
