import { describe, expect, it } from "@effect/vitest";
import {
  configuredMcpCapability,
  groupConfiguredMcpTargets,
  isConfigurableAgentId,
} from "./targeting.js";

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
      agentIds: ["unknown-agent", "amp", "claude-code"],
      scope: "project",
    });

    expect(groups.map((group) => group.members.map((member) => member.agentId))).toEqual([
      ["claude-code"],
    ]);
  });

  it("returns a configured capability only for a known agent with a native MCP writer", () => {
    expect(isConfigurableAgentId("unknown-agent")).toBe(false);
    expect(isConfigurableAgentId("amp")).toBe(true);
    expect(configuredMcpCapability("unknown-agent")).toBeUndefined();
    expect(configuredMcpCapability("amp")).toBeUndefined();
    expect(configuredMcpCapability("claude-code")?.native).toHaveProperty("transports");
  });
});
