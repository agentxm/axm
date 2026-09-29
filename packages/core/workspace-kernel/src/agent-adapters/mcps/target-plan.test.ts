import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { McpServerManifestSchema } from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import { mcpAgentSyncOutcome } from "./sync.js";
import { configuredMcpCapability, declaredMcpWriterTargets } from "./targeting.js";
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
      ["amp", "unverified"],
      ["claude-code", "projected"],
    ]);
    expect(plan.writes.map((write) => write.path).sort()).toEqual([
      ".cursor/mcp.json",
      ".mcp.json",
    ]);
  });

  it("shares ordinary environment references with Command Code and Qoder", () => {
    const plan = planMcpServerTargets({
      agentIds: ["claude-code", "command-code", "qoder"],
      scope: "project",
      serverName: "demo",
      declaration: inline,
      values: inline.env,
      enabled: true,
    });
    expect(plan._tag).toBe("planned");
    if (plan._tag !== "planned") return;
    expect(plan.agents.map((agent) => agent._tag)).toEqual(["projected", "projected", "projected"]);
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0]?.entry).toMatchObject({ env: inline.env });
  });

  it("blocks every reader of a shared file when one cannot expand a default", () => {
    const env = { TOKEN: "${TOKEN:-fallback}" };
    const plan = planMcpServerTargets({
      agentIds: ["claude-code", "github-copilot-cli"],
      scope: "project",
      serverName: "demo",
      declaration: { ...inline, env },
      values: env,
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

describe("agent results with multiple native targets", () => {
  it("keeps the worst terminal result and every completed write", () => {
    const targets = [
      { path: "first.json", change: "created" as const },
      { path: "second.json", change: "updated" as const },
    ];
    expect(
      mcpAgentSyncOutcome(
        [
          {
            _tag: "unverified",
            agentId: "cursor",
            reason: "A further native location is unresolved",
          },
          { _tag: "unsupported", agentId: "cursor", reason: "An entry cannot be represented" },
        ],
        targets,
      ),
    ).toEqual({ _tag: "failed", reason: "A further native location is unresolved", targets });
  });
  it("merges warnings across compatible destinations", () => {
    const capability = configuredMcpCapability("cursor");
    if (capability === undefined) return expect.fail("Cursor writer required");
    const member = declaredMcpWriterTargets(capability)[0];
    if (member === undefined) return expect.fail("Cursor native target required");
    const projected = {
      _tag: "projected",
      agentId: "cursor",
      config: member.config,
      target: member.target,
      entry: {},
      shimmed: false,
    } as const;
    const outcome = mcpAgentSyncOutcome(
      [
        { ...projected, warnings: ["first warning", "shared warning"] },
        { ...projected, shimmed: true, warnings: ["shared warning", "second warning"] },
      ],
      [],
    );
    expect(outcome).toMatchObject({
      _tag: "fallback",
      warnings: ["first warning", "shared warning", "second warning"],
      targets: [],
    });
  });
});
