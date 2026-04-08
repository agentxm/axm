import { Argument, Command, Flag } from "effect/unstable/cli";

import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import {
  annotateCommandMeta,
  registryCommandMeta,
  withCommandRuntime,
} from "../../../command-meta.js";
import { scopeFlag } from "../../../cli-flags.js";
import { handleUpdate } from "./handler.js";
import { withWorkspace } from "../../../runtime.js";

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
    Flag.withDescription("Update only subagents installed for specific agent(s)"),
    Flag.atLeast(0),
  ),
  subagent: Flag.string("subagent").pipe(
    Flag.withDescription("Update only specific subagent(s) by name or glob pattern"),
    Flag.atLeast(0),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Apply all updates without confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Update even if version constraints would prevent it"),
  ),
  preview: previewFlag.pipe(Flag.withDescription("Show available updates without applying them")),
} as const;
const commandMeta = registryCommandMeta("subagents update", { json: true });

export const updateCommand = Command.make(
  "update",
  updateConfig,
  ({ source, scope, agent, subagent, yes, force, preview }) =>
    handleUpdate({
      source,
      agents: agent,
      subagents: subagent,
      yes,
      force,
      preview,
    }).pipe(withWorkspace(scope), withCommandRuntime(commandMeta)),
).pipe(
  withArgvTracking(updateConfig),
  annotateCommandMeta(commandMeta),
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
    { command: "", description: "See also: subagents install, subagents list" },
  ]),
);
