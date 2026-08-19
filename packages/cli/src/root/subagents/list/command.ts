import { Command, Flag } from "effect/unstable/cli";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import { handleListSubagents } from "./handler.js";

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List subagents from project (default) or user-level configuration"),
  ),
  agent: Flag.string("agent").pipe(
    Flag.withDescription("Show only subagents detected for specific agents"),
    Flag.atLeast(0),
  ),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope, agent }) =>
  handleListSubagents({ agents: agent }).pipe(
    withWorkspace({ scope, allowUninitialized: true }),
    withRuntime("subagents list"),
  ),
).pipe(
  withArgvTracking(listConfig),
  Command.withDescription("List detected subagents and their lifecycle classification"),
  Command.withExamples([
    { command: "axm subagents list", description: "Inventory detected subagents" },
    {
      command: "axm subagents list --scope user",
      description: "Check user-level subagents",
    },
    {
      command: "axm subagents list --agent claude-code",
      description: "See subagents for a specific agent",
    },
  ]),
);
