import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  McpConnectionSchema,
  McpValueSchema,
  normalizeMcpValue,
  validateMcpConnection,
} from "../index.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/connection-preserves-runtime-meaning",
  title: "MCP connections preserve explicit invocation meaning",
  statement:
    "AXM shall preserve the explicitly declared transport, executable, ordered arguments, directory base and literal or symbolic values of an MCP connection, without shell splitting, environment resolution or URL-based transport inference.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity"],
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decode = Schema.decodeUnknownSync(McpConnectionSchema, { onExcessProperty: "error" });

describe("explicit MCP invocation", () => {
  it.each([
    { transport: "sse", url: "https://example.test/events" },
    { transport: "streamable-http", url: "https://example.test/sse" },
    {
      transport: "stdio",
      command: "/tools/a directory/server",
      args: [
        "a value with spaces",
        "${LITERAL}",
        { env: "INPUT" },
        { template: ["prefix-", { env: "INPUT" }] },
      ],
      cwd: { base: "scope", path: "tools/server" },
      env: { MODE: "${NOT_A_REFERENCE}", TOKEN: { env: "HOST_TOKEN" } },
    },
  ])("round trips authored meaning without evaluating values", (input) => {
    const connection = decode(input);
    expect(connection).toEqual(input);
    expect(Schema.encodeSync(McpConnectionSchema)(connection)).toEqual(input);
  });

  it.each([
    { command: "node", args: ["server.js"] },
    { transport: "stdio", command: "node", url: "https://example.test" },
    { transport: "sse", url: "https://example.test", env: { INPUT: "value" } },
    { transport: "stdio", command: "node", cwd: { base: "scope", path: "/absolute" } },
    { transport: "stdio", command: "node", cwd: { base: "absolute", path: "relative" } },
    { transport: "stdio", command: "node", args: [{ template: [] }] },
    { transport: "stdio", command: "node", args: [{ env: "" }] },
    { transport: "stdio", command: "node", args: [{ env: "INPUT", extra: "unowned" }] },
    { transport: "stdio", command: "node", args: [{ template: [{ template: ["nested"] }] }] },
  ])("refuses ambiguous or malformed invocation data", (input) => {
    expect(() => decode(input)).toThrow();
  });

  it("normalizes only explicitly authored concatenation", () => {
    expect(normalizeMcpValue({ template: ["one", "two"] })).toBe("onetwo");
    expect(normalizeMcpValue({ template: ["one", "two", { env: "INPUT" }] })).toEqual({
      template: ["onetwo", { env: "INPUT" }],
    });
    expect(Schema.decodeUnknownSync(McpValueSchema)("${INPUT}")).toBe("${INPUT}");
  });

  it("refuses sensitive and host-owned headers without echoing rejected values", () => {
    const connection = decode({
      transport: "streamable-http",
      url: "https://example.test?token=sentinel-private",
      headers: {
        Authorization: "sentinel-private",
        "Mcp-Method": "tools/call",
        X: "sentinel-private\r\nInjected: true",
        x: "duplicate",
      },
    });
    const findings = validateMcpConnection(connection, { type: "native-oauth" });
    expect(findings.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "url-credential",
        "literal-credential",
        "protocol-header",
        "header-newline",
        "duplicate-header",
        "auth-header-conflict",
      ]),
    );
    expect(JSON.stringify(findings)).not.toContain("sentinel-private");
  });
});
