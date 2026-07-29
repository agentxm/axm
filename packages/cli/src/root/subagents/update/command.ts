import { Argument, Command, Flag } from "effect/unstable/cli";

import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags.js";
import { updateNameFilterFlag } from "../../shared/update-targets.js";
import { handleUpdate } from "./handler.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";

const updateConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription(
      "Filter to subagents from a specific source (owner/repo, path, or URL)",
    ),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Update subagents in project (default) or user-level configuration"),
  ),
  agent: Flag.string("agent").pipe(
    Flag.withDescription("Update only subagents installed for specific agents"),
    Flag.atLeast(0),
  ),
  name: updateNameFilterFlag.pipe(
    Flag.withDescription("Update only specific subagents by name or glob pattern"),
  ),
  // Kept alongside --name so existing invocations keep working; both lists are
  // merged into one filter set.
  subagent: Flag.string("subagent").pipe(Flag.withDescription("Alias for --name"), Flag.atLeast(0)),
  yes: yesFlag.pipe(Flag.withDescription("Apply all updates without confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Update even if version constraints would prevent it"),
  ),
  preview: previewFlag.pipe(Flag.withDescription("Show available updates without applying them")),
} as const;

export const updateCommand = Command.make(
  "update",
  updateConfig,
  ({ source, scope, agent, name, subagent, yes, force, preview }) =>
    handleUpdate({
      source,
      agents: agent,
      subagents: [...name, ...subagent],
      yes,
      force,
      preview,
    }).pipe(withWorkspace(scope), withRuntime("subagents update")),
).pipe(
  withArgvTracking(updateConfig),
  Command.withDescription("Update installed subagents to latest versions"),
  Command.withExamples([
    {
      command: "axm subagents update",
      description: "Update all subagents to their latest versions",
    },
    {
      command: "axm subagents update --subagent researcher",
      description: "Update a specific subagent",
    },
    {
      command: "axm subagents update owner/repo",
      description: "Update only subagents from a specific source",
    },
    {
      command: "axm subagents update --preview",
      description: "Preview available updates",
    },
  ]),
);
