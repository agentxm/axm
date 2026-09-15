import { describe, expect, it } from "@effect/vitest";
import { groupConfiguredMcpTargets } from "./targeting.js";

describe("MCP target grouping", () => {
  it("groups configured consumers by their shared physical target", () => {
    const groups = groupConfiguredMcpTargets({
      agentIds: ["claude-code", "github-copilot-cli", "codex", "cursor"],
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

  it("skips unknown agents and agents without an MCP config writer", () => {
    const groups = groupConfiguredMcpTargets({
      agentIds: ["unknown-agent", "claude-code"],
      scope: "project",
    });

    expect(groups.map((group) => group.members.map((member) => member.agentId))).toEqual([
      ["claude-code"],
    ]);
  });
});
