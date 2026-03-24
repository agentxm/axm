import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { withCommandRuntime } from "../../command-runtime.js";
import { forceFlag, previewFlag, yesFlag } from "../../cli-flags/index.js";
import { handleSkillsNew } from "../../cli-commands/skills/new/handler.js";
import { DEFAULT_WORKSPACE_SCOPE, resolveWorkspaceScope } from "../../workspace/scope.js";

export const newCommand = Command.make(
  "new",
  {
    name: Argument.string("name").pipe(
      Argument.withDescription("Name of the skill (without profile)"),
    ),
    profile: Flag.string("profile").pipe(
      Flag.withDescription("Override the workspace profile (e.g., @acme)"),
      Flag.optional,
    ),
    agent: Flag.string("agent").pipe(
      Flag.withDescription("Agent IDs to target (can be repeated)"),
      Flag.atLeast(1),
      Flag.optional,
    ),
    yes: yesFlag,
    force: forceFlag,
    preview: previewFlag,
  },
  ({ name, profile, agent, yes, force, preview }) =>
    withCommandRuntime(
      handleSkillsNew({
        name,
        profile,
        agents: Option.map(agent, (value) => [...value]),
      }),
      {
        command: "skills new",
        workspace: { scope: resolveWorkspaceScope(DEFAULT_WORKSPACE_SCOPE), agents: Option.none() },
        flags: { yes, force, preview },
      },
    ),
).pipe(
  Command.withDescription("Create a new skill"),
  Command.withExamples([
    { command: "axm skills new my-skill", description: "Create a new skill" },
    {
      command: "axm skills new my-skill --profile @acme",
      description: "Create with custom profile",
    },
  ]),
);
