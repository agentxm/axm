import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { SettingsSchema } from "../../index.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/entries-declare-exactly-one-transport",
  title: "MCP entries declare an explicit connection or a sourced distribution",
  statement:
    "An MCP settings entry shall declare either one explicit inline transport or one source with distribution preferences; a source-less preference shall configure only a Pack-supplied member, and ambiguous, legacy or unknown fields shall be refused without rewriting the user's file.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  boundary: "memory",
  boundaryRationale: "Settings decoding decides whether authored invocation intent is accepted.",
  methods: ["decision-table"],
  derivedFrom: [
    "cli/mcps/inline-authority-is-operation-coherent",
    "cli/invalid-workspace-state-gates-operations",
  ],
  supersedes: ["cli/mcps/inline-authority-is-operation-coherent"],
  assumptions: [],
  openQuestions: [],
});

const decode = Schema.decodeUnknownSync(SettingsSchema, { onExcessProperty: "error" });

describe("MCP entry authority", () => {
  it.each([
    "@acme/mcps/tool@^1.0.0",
    { command: "node", args: ["server.js"] },
    { url: "https://example.test/mcp" },
    { source: "@acme/mcps/tool@^1.0.0", connection: { transport: "stdio", command: "node" } },
    { connection: { transport: "stdio", command: "node" }, bindings: [] },
    { connection: { transport: "stdio", command: "node", url: "https://example.test" } },
    { source: "@acme/mcps/tool@^1.0.0", env: { TOKEN: "sentinel-private" } },
    { enabled: false, arbitraryNativeOptions: true },
    {},
  ])("refuses ambiguous or superseded settings", (entry) => {
    expect(() => decode({ mcpServers: { tool: entry } })).toThrow();
  });

  it.each([
    { source: "@acme/mcps/tool@^1.0.0" },
    { connection: { transport: "stdio", command: "node", args: ["a value"] } },
    {
      connection: { transport: "sse", url: "https://example.test/events" },
      auth: { type: "native-oauth" },
    },
    { enabled: false },
    {
      distribution: {
        kind: "remote",
        transport: "streamable-http",
        url: "https://example.test/mcp",
      },
      bindings: [{ target: { kind: "header", name: "Authorization" }, value: { env: "TOKEN" } }],
    },
  ])("preserves inline, sourced and Pack-member intent", (entry) => {
    const settings = decode({ mcpServers: { tool: entry } });
    expect(Schema.encodeSync(SettingsSchema)(settings)).toEqual({ mcpServers: { tool: entry } });
  });

  it("does not disclose a rejected secret through schema errors", () => {
    const result = Schema.decodeUnknownExit(SettingsSchema, { onExcessProperty: "error" })({
      mcpServers: {
        tool: {
          connection: {
            transport: "streamable-http",
            url: "https://example.test",
            headers: { Authorization: "sentinel-private" },
          },
        },
      },
    });
    expect(result._tag).toBe("Failure");
    expect(String(result)).not.toContain("sentinel-private");
  });
});
