import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import {
  inferInlineRemoteTransport,
  resolveSharedMcpTarget,
  groupConfiguredMcpTargets,
} from "@agentxm/extension-workspace";
import { isMcpServerApplicableToAgent, type McpServerEntry } from "@agentxm/workspace-state";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { AdvisoryFinding, AdvisoryRule } from "@agentxm/registry-protocol/unstable/lint/rule";
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
          const applicableAgentIds = group.members
            .filter((member) => isMcpServerApplicableToAgent(entry, member.agentId))
            .map((member) => member.agentId);
          if (applicableAgentIds.length === 0) return [];
          if (applicableAgentIds.length < group.members.length) {
            const untargetedAgentIds = group.members
              .filter((member) => !isMcpServerApplicableToAgent(entry, member.agentId))
              .map((member) => member.agentId);
            return [
              findingFor(
                serverName,
                group.path,
                `MCP target policy cannot be represented; targeted agents ${applicableAgentIds.join(", ")} share it with untargeted agents ${untargetedAgentIds.join(", ")}.`,
                settingsDisplayPath(context.subject.scope),
              ),
            ];
          }
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
