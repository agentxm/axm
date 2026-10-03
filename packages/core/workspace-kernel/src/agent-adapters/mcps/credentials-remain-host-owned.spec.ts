import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  validateMcpConnection,
  projectExpectedEntry,
  configuredMcpCapability,
  type McpConnection,
} from "../index.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/credentials-remain-host-owned",
  title: "MCP credentials remain owned by the native host",
  statement:
    "AXM shall accept MCP credentials only as symbolic native environment references or native OAuth intent, refuse known credentials in literal configuration, URLs and process arguments, and project credential references without obtaining or storing their values. MCP lifecycle operations shall neither depend on nor erase OS credential entries.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity"],
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: ["cli/mcps/secret-namespaces-include-local-and-source-identity"],
  assumptions: [],
  openQuestions: [],
});

describe("host-owned MCP credentials", () => {
  const credential = "fixture-sensitive-value";
  for (const connection of [
    { transport: "stdio", command: "server", env: { API_KEY: credential } },
    { transport: "stdio", command: "server", args: ["--api-key", credential] },
    { transport: "stdio", command: "server", args: [{ env: "API_KEY" }] },
    {
      transport: "streamable-http",
      url: { template: ["https://example.test/", { env: "API_KEY" }] },
    },
    { transport: "streamable-http", url: `https://example.test/?token=${credential}` },
    {
      transport: "streamable-http",
      url: "https://example.test/",
      headers: { Authorization: `Bearer ${credential}` },
    },
  ] satisfies ReadonlyArray<McpConnection>) {
    it(`refuses ${connection.transport} credential literals without echoing them`, () => {
      const findings = validateMcpConnection(connection);
      expect(findings.length).toBeGreaterThan(0);
      expect(JSON.stringify(findings)).not.toContain(credential);
    });
  }
  it("projects a credential reference without a credential service", () => {
    const capability = configuredMcpCapability("codex");
    if (capability === undefined) throw new Error("Codex capability missing");
    const result = projectExpectedEntry({
      serverName: "fixture",
      entry: {
        connection: { transport: "stdio", command: "server", env: { API_KEY: { env: "API_KEY" } } },
      },
      ...capability.native.entryDialect,
      envExpansion: capability.native.mcpEnvExpansion,
    });
    expect(result).toMatchObject({ _tag: "projected", entry: { env_vars: ["API_KEY"] } });
  });
  it("refuses conflicting native OAuth and Authorization ownership", () => {
    expect(
      validateMcpConnection(
        {
          transport: "streamable-http",
          url: "https://example.test/",
          headers: { Authorization: { env: "AUTHORIZATION" } },
        },
        { type: "native-oauth" },
      ).length,
    ).toBeGreaterThan(0);
  });
});
