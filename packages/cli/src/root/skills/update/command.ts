import { Argument, Command, Flag } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags.js";
import { handleUpdate } from "./handler.js";

const updateConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Filter to skills from a specific source (owner/repo, path, or URL)"),
    Argument.optional,
  ),
  scope: scopeFlag,
  agent: Flag.string("agent").pipe(
    Flag.withDescription("Update only skills for specified agent(s)"),
    Flag.atLeast(0),
  ),
  skill: Flag.string("skill").pipe(
    Flag.withDescription("Update only specified skill(s) by name or glob"),
    Flag.atLeast(0),
  ),
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const updateCommand = Command.make(
  "update",
  updateConfig,
  ({ source, scope, agent, skill, yes, force, preview }) =>
    withRuntime(
      withWorkspace(
        scope,
        handleUpdate({ source, agents: agent, skills: skill, yes, force, preview }),
      ),
      { command: "skills update" },
    ),
).pipe(
  withArgvTracking(updateConfig),
  Command.withDescription("Update installed skills to latest versions"),
  Command.withExamples([
    { command: "axm skills update", description: "Update all installed skills" },
    {
      command: "axm skills update owner/repo",
      description: "Update skills from a specific source",
    },
    {
      command: "axm skills update --skill pr-review",
      description: "Update a specific skill by name",
    },
    {
      command: "axm skills update --yes",
      description: "Update all skills without confirmation",
    },
  ]),
);
