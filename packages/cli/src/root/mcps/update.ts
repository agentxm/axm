import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import {
  previewFlag,
  refreshFlag,
  yesFlag,
} from "@agentxm/extension-management/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { resolveWorkspaceUpdateSelection, updateNameFilterFlag } from "../shared/update-targets.js";
import { handleWorkspaceUpdate } from "../update/workspace-update-handler.js";
import { handleUpdate } from "../update/handler.js";
import * as Option from "effect/Option";

const COMMAND = "mcps.update";
const PLAN_NAME = "Update configured MCP servers";
const PLAN_DESCRIPTION = "Update configured MCP servers";

const updateConfig = {
  source: Argument.string("source").pipe(
    Argument.withDescription("Filter to MCP servers matching a name or source"),
    Argument.optional,
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Update in project (default) or user-level configuration"),
  ),
  name: updateNameFilterFlag.pipe(
    Flag.withDescription("Update only specific MCP servers by name or glob pattern"),
  ),
  yes: yesFlag,
  force: refreshFlag,
  preview: previewFlag,
} as const;

export const updateCommand = Command.make(
  "update",
  updateConfig,
  ({ source, scope, name, yes, force, preview }) =>
    Effect.gen(function* () {
      // A registry FQN can name a server that is not configured under that
      // spelling, so a bare positional stays on the root update path that
      // re-resolves it from the source.
      if (Option.isSome(source) && name.length === 0) {
        return yield* handleUpdate({
          source,
          yes,
          force,
          preview,
          recoveryCommand: ["mcps", "update"],
        });
      }

      const selection = yield* resolveWorkspaceUpdateSelection({
        command: COMMAND,
        planName: PLAN_NAME,
        planDescription: PLAN_DESCRIPTION,
        resourceType: "mcp-server",
        resourceLabel: "MCP server",
        resourceLabelPlural: "MCP servers",
        source,
        nameFilters: name,
      });
      if (selection.type === "no-op") return;

      yield* handleWorkspaceUpdate({
        command: COMMAND,
        type: Option.some("mcp-server"),
        planName: PLAN_NAME,
        planDescription: Option.some(PLAN_DESCRIPTION),
        flags: { yes, preview, force },
        ...(selection.type === "names" ? { names: selection.names } : {}),
      });
    }).pipe(withWorkspace(scope), withRuntime("mcps update")),
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
      command: "axm mcps update --name context-*",
      description: "Update only MCP servers matching a glob",
    },
    {
      command: "axm mcps update --preview",
      description: "Preview MCP server updates",
    },
  ]),
);
