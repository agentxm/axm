import { configuredMcpCapability, declaredMcpWriterTargets } from "./targeting.js";
import type { ResolvedMcpConfig } from "./shared-target.js";
import { describe, expect, it } from "vitest";
import {
  type AgentId,
  type McpTypeField,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import { resolveSharedMcpTarget, type SharedMcpTargetMember } from "./shared-target.js";

const projectMember = (agentId: AgentId): SharedMcpTargetMember => {
  const capability = configuredMcpCapability(agentId);
  if (capability === undefined) throw new Error(agentId + " has no MCP writer");
  const selected = declaredMcpWriterTargets(capability).find(
    ({ target }) => target.scope === "project" && target.path === ".mcp.json",
  );
  if (selected === undefined) throw new Error(agentId + " has no shared .mcp.json target");
  return {
    agentId,
    locationId: selected.location.id,
    configured: true,
    config: selected.config,
    target: selected.target,
  };
};

const stdioField = (value: string): McpTypeField => ({
  required: { name: "type", value },
  accepted: [{ name: "type", value }],
});

const configWithTypeField = (typeField: McpTypeField): ResolvedMcpConfig => ({
  serversKey: "mcpServers",
  activationField: { required: null, accepted: [null] },
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
      locationId: "project",
      configured: true,
      config: configWithTypeField(stdioField("stdio")),
      target: { scope: "project", path: ".mcp.json", format: "json", attribution: "shared" },
    };
    const beta: SharedMcpTargetMember = {
      agentId: "beta",
      locationId: "project",
      configured: true,
      config: configWithTypeField(stdioField("local")),
      target: { scope: "project", path: ".mcp.json", format: "jsonc", attribution: "shared" },
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
