import { Command, Flag } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags.js";
import { handleList } from "./handler.js";

const listConfig = {
  scope: scopeFlag,
  agent: Flag.string("agent").pipe(Flag.withDescription("Filter by agent(s)"), Flag.atLeast(0)),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope, agent }) =>
  withRuntime(withWorkspace(scope, handleList({ agents: agent })), { command: "skills list" }),
).pipe(
  withArgvTracking(listConfig),
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
