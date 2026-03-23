import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { withCommandRuntime } from "../../command-runtime.js";
import { handleSkillsNew } from "../../cli-commands/skills/new/handler.js";
import { DEFAULT_WORKSPACE_SCOPE, resolveWorkspaceScope } from "../../workspace/scope.js";

export const newCommand = Command.make(
  "new",
  {
    name: Argument.string("name").pipe(
      Argument.withDescription("Name of the skill (without namespace)"),
    ),
    namespace: Flag.string("namespace").pipe(
      Flag.withDescription("Override the workspace namespace (e.g., @acme)"),
      Flag.optional,
    ),
    agent: Flag.string("agent").pipe(
      Flag.withDescription("Agent IDs to target (can be repeated)"),
      Flag.atLeast(1),
      Flag.optional,
    ),
  },
  ({ name, namespace, agent }) =>
    withCommandRuntime(
      handleSkillsNew({
        name,
        namespace,
        agents: Option.map(agent, (value) => [...value]),
      }),
      {
        command: "skills new",
        workspace: { scope: resolveWorkspaceScope(DEFAULT_WORKSPACE_SCOPE), agents: Option.none() },
      },
    ),
).pipe(
  Command.withDescription("Create a new skill"),
  Command.withExamples([
    { command: "axm skills new my-skill", description: "Create a new skill" },
    {
      command: "axm skills new my-skill --namespace @acme",
      description: "Create with custom namespace",
    },
  ]),
);
