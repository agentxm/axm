import { Command, Flag } from "effect/unstable/cli";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import { agentFlag } from "../../../cli-flags/index.js";
import { scopeFlag } from "../../../cli-flags/scope-flag.js";
import {
  readOnlyCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import { handleListSubagents } from "./handler.js";

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List subagents from project (default) or user-level configuration"),
  ),
  agent: agentFlag.pipe(Flag.withDescription("Show only subagents detected for specific agents")),
} as const;

export const listCommand = Command.make("list", listConfig, ({ scope, agent }) =>
  handleListSubagents({ agents: agent }).pipe(
    withWorkspace({ scope, allowUninitialized: true }),
    withRuntime("subagents list"),
  ),
).pipe(
  withArgvTracking(listConfig),
  withCommandCapabilities(readOnlyCapabilities()),
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
