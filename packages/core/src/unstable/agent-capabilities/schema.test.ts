import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { McpExtensionCapabilitySchema } from "./schema.js";

const decodeMcpCapability = Schema.decodeUnknownSync(McpExtensionCapabilitySchema);

const activeMcpCapability = {
  lifecycle: "supported",
  notes: null,
  docs: [],
  sources: ["https://example.com/mcp"],
  lastVerified: "2026-06-05",
  scopes: ["project"],
  convention: "vendor",
  transports: ["stdio", "http"],
  config: {
    serversKey: "mcpServers",
    nativeEnabled: true,
    targets: [{ scope: "project", path: ".mcp.json", format: "json" }],
    stdio: {
      typeField: null,
      command: "split",
      envKey: "env",
    },
    remote: {
      typeField: {
        name: "type",
        value: { "streamable-http": "http" },
      },
      urlKey: { "streamable-http": "url" },
      headersKey: "headers",
    },
    transform: null,
  },
};

describe("MCP capability schema", () => {
  it("allows non-full active MCP capabilities to carry writer config", () => {
    for (const standardsCompliance of ["parity", "partial", "none"] as const) {
      expect(
        decodeMcpCapability({
          ...activeMcpCapability,
          standardsCompliance,
        }),
      ).toMatchObject({
        standardsCompliance,
        config: { serversKey: "mcpServers" },
      });
    }
  });

  it("allows supported MCP capabilities to omit writer config", () => {
    expect(
      decodeMcpCapability({
        lifecycle: "supported",
        notes: "UI-only surface; no writable MCP config file.",
        docs: [],
        sources: ["https://example.com/mcp"],
        lastVerified: "2026-06-05",
        scopes: ["project"],
        standardsCompliance: "none",
        convention: "vendor",
        transports: ["http"],
      }),
    ).toMatchObject({
      lifecycle: "supported",
      standardsCompliance: "none",
    });
  });

  it("still requires matching config dialects when writer config is present", () => {
    expect(() =>
      decodeMcpCapability({
        ...activeMcpCapability,
        standardsCompliance: "full",
        config: {
          ...activeMcpCapability.config,
          stdio: null,
        },
      }),
    ).toThrow("MCP stdio config is required when stdio transport is supported.");

    expect(() =>
      decodeMcpCapability({
        ...activeMcpCapability,
        standardsCompliance: "full",
        config: {
          ...activeMcpCapability.config,
          remote: null,
        },
      }),
    ).toThrow("MCP remote config is required when http or sse transport is supported.");
  });
});
