import { describe, expect, it } from "vitest";
import { setupScopeSupport } from "./setup-scope-support.js";

const category = (
  support: ReturnType<typeof setupScopeSupport>,
  type: ReturnType<typeof setupScopeSupport>[number]["type"],
) => support.find((candidate) => candidate.type === type);

describe("setupScopeSupport", () => {
  it("reports every extension type in canonical order", () => {
    expect(setupScopeSupport(["claude-code"], "project").map((entry) => entry.type)).toEqual([
      "skill",
      "mcp-server",
      "subagent",
      "rule",
      "hook",
      "knowledge",
      "pack",
    ]);
  });

  it("derives user-scope MCP support and refusals from writer targets", () => {
    const support = setupScopeSupport(["claude-code", "codex"], "user");
    expect(category(support, "mcp-server")?.outcomes).toEqual([
      expect.objectContaining({
        agentId: "claude-code",
        status: "refused",
        reasonCode: "scope-not-modeled",
      }),
      expect.objectContaining({
        agentId: "codex",
        status: "supported",
        reasonCode: "supported",
      }),
    ]);
  });

  it("uses typed user-scope subagent refusals", () => {
    const outcomes = category(
      setupScopeSupport(["claude-code", "adal"], "user"),
      "subagent",
    )?.outcomes;
    expect(outcomes).toEqual([
      expect.objectContaining({
        agentId: "claude-code",
        status: "refused",
        reasonCode: "scope-not-modeled",
        reason: expect.stringContaining("supports user-scope subagents natively"),
      }),
      expect.objectContaining({
        agentId: "adal",
        status: "unsupported",
        reasonCode: "axm-capability-unavailable",
      }),
    ]);
  });

  it("marks hook materialization as intentionally project-only in user scope", () => {
    expect(category(setupScopeSupport(["claude-code"], "user"), "hook")?.outcomes).toEqual([
      expect.objectContaining({
        agentId: "claude-code",
        status: "project-only",
        reasonCode: "project-only",
        reason: expect.stringContaining("intentionally project-only"),
      }),
    ]);
  });

  it("reports workspace and per-agent instruction outcomes together", () => {
    const rules = category(setupScopeSupport(["claude-code"], "project"), "rule");
    expect(rules?.placement).toBe("workspace");
    expect(rules?.outcomes).toEqual([
      expect.objectContaining({ target: "workspace", status: "supported" }),
      expect.objectContaining({
        target: "agent",
        agentId: "claude-code",
        status: "supported",
      }),
    ]);
  });

  it("reports an explicit unsupported outcome when no agents are configured", () => {
    const skills = category(setupScopeSupport([], "project"), "skill");
    expect(skills?.outcomes).toEqual([
      expect.objectContaining({
        target: "agent-set",
        status: "unsupported",
        reasonCode: "no-configured-agents",
      }),
    ]);
  });
});
