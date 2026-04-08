/**
 * List command definition for `axm subagents list`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { Command, Flag } from "effect/unstable/cli";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import {
  annotateCommandMeta,
  registryCommandMeta,
  withCommandRuntime,
} from "../../../command-meta.js";
import { scopeFlag } from "../../../cli-flags.js";
import { withWorkspace } from "../../../runtime.js";
import { handleListSubagents } from "./handler.js";

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

const listConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("List subagents from project (default) or user-level configuration"),
  ),
  agent: Flag.string("agent").pipe(
    Flag.withDescription("Show only subagents installed for specific agent(s)"),
    Flag.atLeast(0),
  ),
} as const;
const commandMeta = registryCommandMeta("subagents list", { json: true });

export const listCommand = Command.make("list", listConfig, ({ scope, agent }) =>
  handleListSubagents({ agents: agent }).pipe(
    withWorkspace(scope),
    withCommandRuntime(commandMeta),
  ),
).pipe(
  withArgvTracking(listConfig),
  annotateCommandMeta(commandMeta),
  Command.withAlias("ls"),
  Command.withDescription("List installed subagents"),
  Command.withExamples([
    { command: "axm subagents list", description: "See what subagents are installed" },
    {
      command: "axm subagents list --scope user",
      description: "Check user-level subagents",
    },
    {
      command: "axm subagents list --agent claude-code",
      description: "See subagents for a specific agent",
    },
    { command: "", description: "See also: subagents install, subagents update" },
  ]),
);
