import { Command, Flag } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { scopeFlag } from "../../cli-flags/index.js";
import { handleList } from "../../cli-commands/skills/list/handler.js";

export const listCommand = Command.make(
  "list",
  {
    scope: scopeFlag,
    agent: Flag.string("agent").pipe(Flag.withDescription("Filter by agent(s)"), Flag.atLeast(0)),
  },
  ({ scope, agent }) =>
    withRuntime(withWorkspace(scope, handleList({ agents: agent })), { command: "skills list" }),
).pipe(
  Command.withAlias("ls"),
  Command.withDescription("List installed skills"),
  Command.withExamples([
    { command: "axm skills list", description: "List all installed skills" },
    {
      command: "axm skills list --scope user",
      description: "List user-scope installed skills",
    },
    {
      command: "axm skills list --agent claude-code",
      description: "List skills for a specific agent",
    },
  ]),
);
