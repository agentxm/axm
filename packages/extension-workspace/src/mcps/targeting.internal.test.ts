import { describe, expect, it } from "@effect/vitest";
import type { McpServerEntry } from "@agentxm/workspace-state";
import { planMcpTargetGroups, sharedMcpTargetPolicyConflict } from "./targeting.js";

const entry = {
  source: "inline",
  enabled: true,
  command: "linear-mcp",
  args: [],
  env: {},
} satisfies McpServerEntry;

describe("MCP target planning", () => {
  it("plans only configured consumers and collapses their shared physical target", () => {
    const groups = planMcpTargetGroups({
      configuredAgentIds: ["claude-code", "github-copilot-cli", "codex", "cursor"],
      entry,
      scope: "project",
    });

    expect(
      groups.map((group) => ({
        path: group.path,
        agentIds: group.members.map((member) => member.agentId),
      })),
    ).toEqual([
      { path: ".mcp.json", agentIds: ["claude-code", "github-copilot-cli"] },
      { path: ".codex/config.toml", agentIds: ["codex"] },
      { path: ".cursor/mcp.json", agentIds: ["cursor"] },
    ]);
  });

  it("keeps a split policy on one physical target unrepresentable", () => {
    expect(
      sharedMcpTargetPolicyConflict({
        entry: { ...entry, agents: ["claude-code"] },
        agentIds: ["claude-code", "github-copilot-cli"],
        scope: "project",
      }),
    ).toContain("targeted agents claude-code share it with untargeted agents github-copilot-cli");
  });
});
