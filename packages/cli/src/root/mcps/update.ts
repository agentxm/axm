import { Argument, Command, Flag } from "effect/unstable/cli";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { handleWorkspaceUpdate } from "../update/workspace-update-handler.js";
import { handleUpdate } from "../update/handler.js";
import * as Option from "effect/Option";

const updateConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Optional MCP server registry FQN to update"),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Update in project (default) or user-level configuration"),
  ),
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const updateCommand = Command.make(
  "update",
  updateConfig,
  ({ source, scope, yes, force, preview }) =>
    (Option.isSome(source)
      ? handleUpdate({ source, yes, force, preview })
      : handleWorkspaceUpdate({
          command: "mcps.update",
          type: Option.some("mcp-server"),
          planName: "Update configured MCP servers",
          planDescription: Option.some("Update configured MCP servers"),
          flags: { yes, force, preview },
        })
    ).pipe(withWorkspace(scope), withRuntime("mcps update")),
).pipe(
  withArgvTracking(updateConfig),
  Command.withDescription("Update MCP servers"),
  Command.withExamples([
    { command: "axm mcps update", description: "Update configured MCP servers" },
    {
      command: "axm mcps update @acme/mcps/context",
      description: "Update one MCP server by registry name",
    },
    {
      command: "axm mcps update --preview",
      description: "Preview MCP server updates",
    },
  ]),
);
