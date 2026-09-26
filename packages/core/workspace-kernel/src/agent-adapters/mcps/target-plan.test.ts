import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { McpServerManifestSchema } from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import { planMcpServerTargets } from "./target-plan.js";

const inline = {
  kind: "inline",
  command: "npx",
  args: ["-y", "demo-mcp"],
  enabled: true,
  env: { TOKEN: "${TOKEN}" },
} as const;

const manifest = Schema.decodeUnknownSync(McpServerManifestSchema)({
  owner: "@acme",
  type: "mcp-server",
  name: "context",
  version: "1.0.0",
  server: {
    name: "ai.acme/context",
    description: "Context",
    version: "1.0.0",
    packages: [
      {
        registryType: "npm",
        identifier: "@acme/context",
        version: "1.0.0",
        transport: { type: "stdio" },
        environmentVariables: [{ name: "API_TOKEN", isRequired: true, isSecret: true }],
      },
    ],
  },
});

describe("planMcpServerTargets", () => {
  it("renders one entry per shared file and reports every agent in request order", () => {
    const plan = planMcpServerTargets({
      agentIds: ["cursor", "amp", "claude-code"],
      scope: "project",
      serverName: "demo",
      declaration: inline,
      values: inline.env,
      enabled: true,
    });
    expect(plan._tag).toBe("planned");
    if (plan._tag !== "planned") return;
    expect(plan.agents.map((agent) => [agent.agentId, agent._tag])).toEqual([
      ["cursor", "projected"],
      ["amp", "unsupported"],
      ["claude-code", "projected"],
    ]);
    expect(plan.writes.map((write) => write.path).sort()).toEqual([
      ".cursor/mcp.json",
      ".mcp.json",
    ]);
  });

  it("blocks every reader of a shared file when one of them cannot represent the entry", () => {
    // claude-code expands braced environment references in `.mcp.json`;
    // command-code reads the same file and expands none, so the shared file
    // has no shape both accept.
    const plan = planMcpServerTargets({
      agentIds: ["claude-code", "command-code"],
      scope: "project",
      serverName: "demo",
      declaration: inline,
      values: inline.env,
      enabled: true,
    });
    expect(plan._tag).toBe("planned");
    if (plan._tag !== "planned") return;
    expect(plan.agents.map((agent) => agent._tag)).toEqual(["blocked", "blocked"]);
    expect(plan.agents[0]?._tag === "blocked" ? plan.agents[0].reason : "").toContain(
      "cannot read shared MCP target '.mcp.json'",
    );
    expect(plan.writes).toEqual([]);
  });

  it("refuses an inline definition with neither command nor URL", () => {
    const plan = planMcpServerTargets({
      agentIds: ["claude-code"],
      scope: "project",
      serverName: "demo",
      declaration: { kind: "inline", enabled: true, env: {} },
      values: {},
      enabled: true,
    });
    expect(plan._tag).toBe("invalid");
  });

  it("resolves a manifest-backed connection through the shared file's one configuration", () => {
    const plan = planMcpServerTargets({
      agentIds: ["claude-code", "github-copilot-cli"],
      scope: "project",
      serverName: "context",
      declaration: { kind: "configuration", env: {} },
      manifest,
      values: { API_TOKEN: "${API_TOKEN}" },
      enabled: true,
    });
    expect(plan._tag).toBe("planned");
    if (plan._tag !== "planned") return;
    expect(plan.agents.map((agent) => agent._tag)).toEqual(["projected", "projected"]);
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0]?.entry).toMatchObject({
      command: "npx",
      args: ["-y", "@acme/context@1.0.0"],
      env: { API_TOKEN: "${API_TOKEN}" },
    });
  });

  it("reports a required secret nobody supplied as needing input, with the entry it would write", () => {
    const plan = planMcpServerTargets({
      agentIds: ["claude-code"],
      scope: "project",
      serverName: "context",
      declaration: { kind: "configuration", env: {} },
      manifest,
      values: {},
      enabled: true,
    });
    expect(plan._tag).toBe("planned");
    if (plan._tag !== "planned") return;
    expect(plan.agents[0]).toMatchObject({ _tag: "needs-input", missing: ["API_TOKEN"] });
    expect(plan.writes[0]?.entry).toMatchObject({ env: { API_TOKEN: "${API_TOKEN}" } });
  });
});
