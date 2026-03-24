import * as Console from "effect/Console";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { withRuntime } from "../../main.js";

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
  (config) => {
    const namespace = Option.getOrElse(config.namespace, () => "-");
    const agents = Option.match(config.agent, {
      onNone: () => "-",
      onSome: (agentIds) => agentIds.join(", "),
    });

    return withRuntime(
      Console.log(`[stub] skills new name=${config.name} namespace=${namespace} agents=${agents}`),
      { command: "skills new" },
    );
  },
).pipe(
  Command.withDescription("Create a new skill"),
  Command.withExamples([
    { command: "axm-spike skills new my-skill", description: "Create a new skill" },
    {
      command: "axm-spike skills new my-skill --namespace @acme",
      description: "Create with custom namespace",
    },
    {
      command: "axm-spike skills new my-skill --agent codex --agent claude-code",
      description: "Create for specific agent targets",
    },
  ]),
);
