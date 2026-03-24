import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { withRuntime } from "../../runtime.js";
import { handleList } from "../../cli-commands/skills/list/handler.js";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WORKSPACE_SCOPES,
  resolveWorkspaceScope,
} from "../../workspace/scope.js";

export const listCommand = Command.make(
  "list",
  {
    scope: Flag.choice("scope", WORKSPACE_SCOPES).pipe(
      Flag.withDescription("Configuration scope: project (default) or user"),
      Flag.withDefault(DEFAULT_WORKSPACE_SCOPE),
    ),
    agent: Flag.string("agent").pipe(Flag.withDescription("Filter by agent(s)"), Flag.atLeast(0)),
  },
  ({ scope, agent }) =>
    withRuntime(handleList({ agents: agent }), {
      command: "skills list",
      workspace: { scope: resolveWorkspaceScope(scope), agents: Option.none() },
    }),
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
