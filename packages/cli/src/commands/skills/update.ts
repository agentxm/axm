import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "../../cli-flags/index.js";
import { handleUpdate } from "../../cli-commands/skills/update/handler.js";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WORKSPACE_SCOPES,
  resolveWorkspaceScope,
} from "../../workspace/scope.js";

export const updateCommand = Command.make(
  "update",
  {
    source: Argument.string("source").pipe(
      Argument.withDescription(
        "Filter to skills from a specific source (owner/repo, path, or URL)",
      ),
      Argument.optional,
    ),
    scope: Flag.choice("scope", WORKSPACE_SCOPES).pipe(
      Flag.withDescription("Configuration scope: project (default) or user"),
      Flag.withDefault(DEFAULT_WORKSPACE_SCOPE),
    ),
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
  },
  ({ source, scope, agent, skill, yes, force, preview }) =>
    withRuntime(
      withWorkspace(
        { scope: resolveWorkspaceScope(scope), agents: Option.none() },
        handleUpdate({ source, scope: resolveWorkspaceScope(scope), agents: agent, skills: skill }),
      ),
      { command: "skills update", flags: { yes, force, preview } },
    ),
).pipe(
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
