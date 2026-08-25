import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { inferInlineRemoteTransport } from "../../../mcps/projection.js";
import { resolveSharedMcpTarget } from "../../../mcps/shared-target.js";
import { groupConfiguredMcpTargets } from "../../../mcps/targeting.js";
import type { McpServerEntry } from "../../../settings/index.js";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { settingsDisplayPath } from "./display-paths.js";

const RULE_ID = "workspace/mcps-shared-target-compatible";

const transportFor = (entry: McpServerEntry) => {
  if (entry.command !== undefined) return "stdio";
  if (entry.url === undefined) return undefined;
  const inference = inferInlineRemoteTransport(entry.url);
  return inference._tag === "supported" ? inference.transport : undefined;
};

const findingFor = (
  serverName: string,
  path: string,
  reason: string,
  settingsPath: string,
): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message:
    "MCP server '" +
    serverName +
    "' projects a value that another configured agent rejects in shared target '" +
    path +
    "'. " +
    reason +
    " Update the configured agents or their MCP compatibility metadata before syncing.",
  location: { file: settingsPath },
});

export const mcpServerSharedTargetCompatibleRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Configured agents accept the values projected into shared MCP config targets.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.gen(function* () {
      const settings = yield* Effect.result(context.workspace.state.settings);
      if (Result.isFailure(settings) || Option.isNone(settings.success)) return [];
      const agentIds = settings.success.value.agents ?? [];
      const entries = settings.success.value.mcpServers ?? {};
      const groups = groupConfiguredMcpTargets({
        agentIds,
        scope: context.subject.scope,
      }).filter((group) => group.members.length > 1);
      return Object.entries(entries).flatMap(([serverName, entry]) => {
        const transport = transportFor(entry);
        if (transport === undefined) return [];
        return groups.flatMap((group) => {
          const resolution = resolveSharedMcpTarget({ members: group.members, transport });
          return resolution._tag === "conflict"
            ? [
                findingFor(
                  serverName,
                  resolution.path,
                  resolution.reason,
                  settingsDisplayPath(context.subject.scope),
                ),
              ]
            : [];
        });
      });
    }),
};
