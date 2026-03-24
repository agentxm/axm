import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "../../cli-flags/index.js";
import { handleInit } from "../../cli-commands/init/handler.js";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WORKSPACE_SCOPES,
  resolveWorkspaceScope,
} from "../../workspace/scope.js";

export const initCommand = Command.make(
  "init",
  {
    scope: Flag.choice("scope", WORKSPACE_SCOPES).pipe(
      Flag.withDescription("Configuration scope: project (default) or user"),
      Flag.withDefault(DEFAULT_WORKSPACE_SCOPE),
    ),
    agent: Flag.string("agent").pipe(
      Flag.withDescription("Specify agent(s) to configure (skips auto-detection)"),
      Flag.atLeast(0),
    ),
    yes: yesFlag,
    force: forceFlag,
    preview: previewFlag,
  },
  ({ scope, agent, yes, force, preview }) =>
    withRuntime(
      withWorkspace(
        {
          scope: resolveWorkspaceScope(scope),
          agents: agent.length > 0 ? Option.some(agent) : Option.none(),
        },
        handleInit(),
      ),
      { command: "init", flags: { yes, force, preview } },
    ),
).pipe(
  Command.withDescription("Set up axm in the current project"),
  Command.withExamples([
    { command: "axm init", description: "Detect installed agents and create .axm/settings.json" },
    {
      command: "axm init --non-interactive",
      description: "Initialize with all detected agents (no prompts)",
    },
    { command: "axm init --scope user", description: "Initialize in ~/.axm/ for user scope" },
    {
      command: "axm init --agent claude-code --agent cursor",
      description: "Initialize with specific agents",
    },
  ]),
);
