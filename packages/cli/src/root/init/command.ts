import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { scopeFlag } from "../../cli-flags/index.js";
import { handleInit } from "./handler.js";

const initConfig = {
  scope: scopeFlag,
  agent: Flag.string("agent").pipe(
    Flag.withDescription("Specify agent(s) to configure (skips auto-detection)"),
    Flag.atLeast(0),
  ),
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const initCommand = Command.make("init", initConfig, ({ scope, agent }) =>
  withRuntime(
    withWorkspace(agent.length > 0 ? { scope, agents: Option.some(agent) } : scope, handleInit()),
    { command: "init" },
  ),
).pipe(
  withArgvTracking(initConfig),
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
