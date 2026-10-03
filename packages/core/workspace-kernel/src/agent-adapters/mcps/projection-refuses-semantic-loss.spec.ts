import { defineSpecification } from "@agentxm/specification-metadata";
import { describe, expect, it } from "@effect/vitest";
import { type ConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities";
import { configuredMcpCapability } from "../index.js";
import type { McpConnection } from "../index.js";
import { projectExpectedEntry, renderEnvValue } from "../index.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/projection-refuses-semantic-loss",
  title: "Native MCP projection refuses semantic loss",
  statement:
    "AXM shall render one explicitly selected MCP invocation using the target host's supported per-field semantics, preserve literal tokens and native credential references, and refuse unrepresentable transports, interpolation and execution syntax without shims.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "agent-interoperability"],
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const project = (id: ConfigurableAgentId, connection: McpConnection) => {
  const capability = configuredMcpCapability(id);
  if (capability === undefined) throw new Error("Fixture lacks native MCP dialect");
  const native = capability.native;
  return projectExpectedEntry({
    serverName: "demo",
    entry: { kind: "inline", enabled: true, connection },
    ...native.entryDialect,
    envExpansion: native.mcpEnvExpansion,
  });
};
describe("typed native projection", () => {
  it("does not interpret canonical strings as environment references", () => {
    expect(renderEnvValue("${TOKEN}", { variables: "none", defaults: false })).toEqual({
      value: "${TOKEN}",
    });
    expect(
      renderEnvValue("${TOKEN}", { variables: "braced", defaults: true }).warning,
    ).toBeDefined();
    expect(renderEnvValue({ env: "TOKEN" }, { variables: "env-colon", defaults: false })).toEqual({
      value: "${env:TOKEN}",
    });
    expect(
      renderEnvValue(
        { template: ["Bearer ", { env: "TOKEN" }] },
        { variables: "env-tag", defaults: false },
      ),
    ).toEqual({ value: "Bearer {env:TOKEN}" });
  });
  it("preserves executable and argument tokens", () => {
    expect(
      project("codex", {
        transport: "stdio",
        command: "/Applications/My Server/bin/run",
        args: ["one two", "", "${literal}"],
        env: { TOKEN: { env: "TOKEN" }, REGION: "west" },
      }),
    ).toMatchObject({
      _tag: "projected",
      entry: {
        command: "/Applications/My Server/bin/run",
        args: ["one two", "", "${literal}"],
        env_vars: ["TOKEN"],
        env: { REGION: "west" },
      },
    });
  });
  it("renders OpenCode V2 arrays and native references", () => {
    expect(
      project("opencode", {
        transport: "stdio",
        command: "node",
        args: [{ env: "SCRIPT" }],
        cwd: { base: "absolute", path: "/work" },
      }),
    ).toMatchObject({
      _tag: "projected",
      entry: { type: "local", command: ["node", "{env:SCRIPT}"], cwd: "/work", disabled: false },
    });
  });
  it("uses Codex native credential forwarding fields", () => {
    expect(
      project("codex", {
        transport: "streamable-http",
        url: "https://example.test/sse",
        headers: {
          Authorization: { template: ["Bearer ", { env: "TOKEN" }] },
          "X-Api-Key": { env: "KEY" },
        },
      }),
    ).toMatchObject({
      _tag: "projected",
      entry: {
        url: "https://example.test/sse",
        bearer_token_env_var: "TOKEN",
        env_http_headers: { "X-Api-Key": "KEY" },
      },
    });
  });
  for (const id of [
    "claude-code",
    "cursor",
    "github-copilot-cli",
    "vscode",
    "pi",
    "codex",
    "opencode",
  ] as const) {
    it(`projects an explicit HTTP invocation for ${id}`, () => {
      expect(
        project(id, { transport: "streamable-http", url: "https://example.test/sse" })._tag,
      ).toBe("projected");
    });
  }
  it("refuses SSE for Pi without a subprocess shim", () => {
    expect(project("pi", { transport: "sse", url: "https://example.test/mcp" })._tag).toBe(
      "unsupported",
    );
  });
  it("refuses Pi dynamic execution and home expansion", () => {
    expect(project("pi", { transport: "stdio", command: "~/server" })._tag).toBe("unsupported");
    expect(
      project("pi", { transport: "stdio", command: "server", env: { REGION: "!shell" } })._tag,
    ).toBe("unsupported");
  });
});
