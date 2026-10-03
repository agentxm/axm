import { defineSpecification } from "@agentxm/specification-metadata";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import {
  CONFIGURABLE_AGENTS_BY_ID,
  type ConfigurableAgentId,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import { preflightMcpImports, type McpImportSource } from "../index.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/import/preserves-or-refuses-native-semantics",
  title: "Native MCP adoption preserves or refuses every invocation field",
  statement:
    "AXM shall adopt native MCP configuration only when every field's supported transport, literal or symbolic value, activation and directory meaning can be preserved, and shall report unsupported fields and literal credentials without silently replacing or dropping them.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "agent-interoperability"],
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const source = (
  agentId: ConfigurableAgentId,
  servers: Readonly<Record<string, unknown>>,
): McpImportSource => {
  const native = CONFIGURABLE_AGENTS_BY_ID[agentId].capabilities["mcp-server"].native;
  if (!("entryDialect" in native) || native.entryDialect === null)
    throw new Error("Fixture needs a native MCP dialect");
  return {
    agentId,
    dialect: native.entryDialect,
    workspaceRoot: "/workspace",
    fingerprint: "observed-document",
    filePath: `/workspace/${agentId}.json`,
    serversPath: ["mcpServers"],
    target: { scope: "project", path: `${agentId}.json`, format: "json", attribution: "agent" },
    ...(!("mcpEnvExpansion" in native) || native.mcpEnvExpansion === undefined
      ? {}
      : { envExpansion: native.mcpEnvExpansion }),
    servers,
  };
};
const inspect = (...sources: ReadonlyArray<McpImportSource>) =>
  preflightMcpImports({
    configuredNames: new Set(),
    now: DateTime.makeUnsafe("2026-10-02T00:00:00Z"),
    sources,
  });

describe("lossless native MCP import preflight", () => {
  it("retains literal values and decodes only the source host's references", () => {
    const result = inspect(
      source("opencode", {
        demo: {
          type: "local",
          command: ["node", "literal ${VALUE}"],
          environment: { MODE: "literal", TOKEN: "{env:HOST_TOKEN}" },
          disabled: true,
        },
      }),
    );
    expect(result.conflicts).toEqual([]);
    expect(result.candidates[0]).toMatchObject({
      enabled: false,
      definition: {
        transport: "stdio",
        command: "node",
        args: ["literal ${VALUE}"],
        env: { MODE: "literal", TOKEN: { env: "HOST_TOKEN" } },
      },
    });
  });

  it("deduplicates equivalent host spellings without replacing exact adoption snapshots", () => {
    const a = source("claude-code", {
      demo: {
        type: "http",
        url: "https://example.test/mcp",
        headers: { Authorization: "Bearer ${TOKEN}" },
      },
    });
    const b = source("codex", {
      demo: { url: "https://example.test/mcp", bearer_token_env_var: "TOKEN" },
    });
    const result = inspect(a, b);
    expect(result.conflicts).toEqual([]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.adoptions).toHaveLength(2);
    expect(result.candidates[0]?.definition).toEqual({
      transport: "streamable-http",
      url: "https://example.test/mcp",
      headers: { Authorization: { template: ["Bearer ", { env: "TOKEN" }] } },
    });
  });

  it.each(["timeout", "envFile", "oauth", "disabledTools", "unrecognizedVendorFlag"])(
    "refuses unaccounted native field %s",
    (key) => {
      const result = inspect(
        source("claude-code", { demo: { type: "stdio", command: "node", [key]: "not-canonical" } }),
      );
      expect(result.candidates).toEqual([]);
      expect(result.conflicts).toHaveLength(1);
    },
  );

  it("does not replace literal credentials with invented references", () => {
    const result = inspect(
      source("claude-code", {
        demo: { type: "stdio", command: "node", env: { TOKEN: "private-sentinel" } },
      }),
    );
    expect(result.candidates).toEqual([]);
    expect(result.conflicts).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("private-sentinel");
  });

  it("blocks credential arguments even when native interpolation could expand them", () => {
    const result = inspect(
      source("claude-code", {
        demo: { type: "stdio", command: "node", args: ["--token", "${TOKEN}"] },
      }),
    );
    expect(result.candidates).toEqual([]);
    expect(result.conflicts[0]?.reason).toContain("process arguments");
  });

  it("keeps SSE explicit without interpreting endpoint suffixes", () => {
    const result = inspect(
      source("claude-code", {
        http: { type: "http", url: "https://example.test/sse" },
        events: { type: "sse", url: "https://example.test/events" },
      }),
    );
    expect(result.conflicts).toEqual([]);
    expect(result.candidates.map(({ definition }) => definition.transport)).toEqual([
      "sse",
      "streamable-http",
    ]);
  });

  it("refuses an ambiguous implicit remote transport", () => {
    const result = inspect(source("cursor", { demo: { url: "https://example.test/sse" } }));
    expect(result.candidates).toEqual([]);
    expect(result.conflicts).toHaveLength(1);
  });

  it("retains absolute Pi cwd and blocks unresolved session-directory defaults", () => {
    const result = inspect(
      source("pi", {
        explicit: { command: "node", cwd: "/tools/server" },
        implicit: { command: "node" },
      }),
    );
    expect(result.candidates[0]?.definition).toMatchObject({
      cwd: { base: "absolute", path: "/tools/server" },
    });
    expect(result.conflicts.map(({ name }) => name)).toEqual(["implicit"]);
  });

  it("reports non-object entries rather than silently skipping them", () => {
    const result = inspect(source("claude-code", { broken: false }));
    expect(result.conflicts.map(({ name }) => name)).toEqual(["broken"]);
  });
});
