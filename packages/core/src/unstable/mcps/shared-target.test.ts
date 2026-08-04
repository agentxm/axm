import { describe, expect, it } from "vitest";
import {
  AGENTS_BY_ID,
  type AgentId,
  type McpConfig,
  type McpTypeField,
} from "../agent-capabilities/index.js";
import { resolveSharedMcpTarget, type SharedMcpTargetMember } from "./shared-target.js";

const projectMember = (agentId: AgentId): SharedMcpTargetMember => {
  const capability = AGENTS_BY_ID[agentId].capabilities["mcp-server"];
  const writer = capability.axm.writer;
  if (writer === null) throw new Error(agentId + " has no MCP writer");
  const target = writer.config.targets.find(
    (candidate) => candidate.scope === "project" && candidate.path === ".mcp.json",
  );
  if (target === undefined) throw new Error(agentId + " has no shared .mcp.json target");
  return { agentId, config: writer.config, target };
};

const stdioField = (value: string): McpTypeField => ({
  required: { name: "type", value },
  accepted: [{ name: "type", value }],
});

const configWithTypeField = (typeField: McpTypeField): McpConfig => ({
  serversKey: "mcpServers",
  activationField: { required: null, accepted: [null] },
  targets: [{ scope: "project", path: ".mcp.json", format: "json" }],
  stdio: {
    typeField,
    command: "split",
    envKey: "env",
  },
  remote: null,
});

describe("shared MCP target compatibility", () => {
  it("resolves Claude Code and Copilot CLI to stdio in either agent order", () => {
    const claude = projectMember("claude-code");
    const copilot = projectMember("github-copilot-cli");

    const forward = resolveSharedMcpTarget({
      members: [claude, copilot],
      transport: "stdio",
    });
    const reverse = resolveSharedMcpTarget({
      members: [copilot, claude],
      transport: "stdio",
    });

    expect(forward).toEqual(reverse);
    expect(forward._tag).toBe("resolved");
    if (forward._tag === "resolved") {
      expect(forward.config.stdio?.typeField.required).toEqual({
        name: "type",
        value: "stdio",
      });
    }
  });

  it("omits activation when every shared reader accepts omission", () => {
    const claude = projectMember("claude-code");
    const codebuddy = projectMember("codebuddy");
    const resolved = resolveSharedMcpTarget({
      members: [codebuddy, claude],
      transport: "stdio",
    });

    expect(resolved._tag).toBe("resolved");
    if (resolved._tag === "resolved") {
      expect(resolved.config.activationField.required).toBeNull();
    }
  });

  it("reports the target and incompatible axis when accepted values do not intersect", () => {
    const alpha: SharedMcpTargetMember = {
      agentId: "alpha",
      config: configWithTypeField(stdioField("stdio")),
      target: { scope: "project", path: ".mcp.json", format: "json" },
    };
    const beta: SharedMcpTargetMember = {
      agentId: "beta",
      config: configWithTypeField(stdioField("local")),
      target: { scope: "project", path: ".mcp.json", format: "jsonc" },
    };
    const result = resolveSharedMcpTarget({
      members: [beta, alpha],
      transport: "stdio",
    });

    expect(result).toMatchObject({
      _tag: "conflict",
      path: ".mcp.json",
      axis: "stdio discriminator",
      agentIds: ["alpha", "beta"],
    });
    if (result._tag === "conflict") {
      expect(result.reason).toContain("empty intersection");
    }
  });
});
