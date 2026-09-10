import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

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
  readonly preview: boolean;
}

export const handleRulesNew = (args: RulesNewHandlerArgs) =>
  runCreateExtensionCommand({
    command: "rules.new",
    preview: args.preview,
    request: { type: "rule", name: args.name, owner: args.owner, title: args.title },
    suggestions: (candidate) => [
      { description: `Write the rule body in \`${candidate.entryPath}\`` },
    ],
  });

const newConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the rule (without owner)")),
  owner: Flag.string("owner").pipe(
    Flag.withDescription(
      "Owner to create under; recorded as the workspace owner when none is set (e.g., @acme)",
    ),
    Flag.optional,
  ),
  title: Flag.string("title").pipe(
    Flag.withDescription("Display title for the rule"),
    Flag.optional,
  ),
  preview: previewCapabilityFlag("Show what would be created without writing files"),
} as const;

export const newCommand = Command.make("new", newConfig, ({ name, owner, title, preview }) =>
  handleRulesNew({ name, owner, title, preview }).pipe(
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
