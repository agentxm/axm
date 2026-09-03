import { Argument, Command, Flag } from "effect/unstable/cli";

import { ignoreVersionConstraintsFlag, previewFlag, yesFlag } from "../../../cli-flags/index.js";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import { scopeFlag } from "../../../cli-flags/scope-flag.js";
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
  name: updateNameFilterFlag.pipe(
    Flag.withDescription("Update only specific subagents by name or glob pattern"),
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
  ({ source, scope, name, yes, force, preview }) =>
    handleUpdate({
      source,
      subagents: name,
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
      command: "axm subagents update --name researcher",
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
