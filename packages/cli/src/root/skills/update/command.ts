import { Argument, Command, Flag } from "effect/unstable/cli";

import {
  ignoreVersionConstraintsFlag,
  previewFlag,
  yesFlag,
} from "@agentxm/extension-management/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags.js";
import { updateNameFilterFlag } from "../../shared/update-targets.js";
import { handleUpdate } from "./handler.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";

const updateConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Filter to skills from a specific source (owner/repo, path, or URL)"),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Update skills in project (default) or user-level configuration"),
  ),
  agent: Flag.string("agent").pipe(
    Flag.withDescription("Update only skills installed for specific agents"),
    Flag.atLeast(0),
  ),
  name: updateNameFilterFlag.pipe(
    Flag.withDescription("Update only specific skills by name or glob pattern"),
  ),
  yes: yesFlag.pipe(
    Flag.withDescription(
      "Pre-approve the update when it carries a risk that would otherwise prompt",
    ),
  ),
  force: ignoreVersionConstraintsFlag,
  preview: previewFlag.pipe(Flag.withDescription("Show available updates without applying them")),
} as const;

export const updateCommand = Command.make(
  "update",
  updateConfig,
  ({ source, scope, agent, name, yes, force, preview }) =>
    handleUpdate({
      source,
      agents: agent,
      skills: name,
      yes,
      force,
      preview,
    }).pipe(withWorkspace(scope), withRuntime("skills update")),
).pipe(
  withArgvTracking(updateConfig),
  Command.withDescription("Update installed skills to latest versions"),
  Command.withExamples([
    { command: "axm skills update", description: "Update all skills to their latest versions" },
    {
      command: "axm skills update --name code-review",
      description: "Update a specific skill",
    },
    {
      command: "axm skills update owner/repo",
      description: "Update only skills from a specific source",
    },
    {
      command: "axm skills update --preview",
      description: "Preview available updates",
    },
  ]),
);
