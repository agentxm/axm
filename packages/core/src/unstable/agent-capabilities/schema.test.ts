import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { HooksExtensionCapabilitySchema, McpExtensionCapabilitySchema } from "./schema.js";
const decodeMcpCapability = Schema.decodeUnknownSync(McpExtensionCapabilitySchema);
const decodeHooksCapability = Schema.decodeUnknownSync(HooksExtensionCapabilitySchema);
const activeMcpCapability = {
  native: {
    availability: { via: "native" },
    vendorStatus: { state: "active" },
    notes: null,
    docs: [],
    sources: ["https://example.com/mcp"],
    scopes: ["project"],
    standardsCompliance: "full",
    convention: "vendor",
    transports: ["stdio", "http"],
  },
  axm: {
    status: "supported",
    lastVerified: "2026-06-05",
    writer: {
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
    },
  },
};
describe("MCP capability schema", () => {
  it("allows non-full active MCP capabilities to carry writer config", () => {
    for (const standardsCompliance of ["parity", "partial", "none"] as const) {
      expect(
        decodeMcpCapability({
          ...activeMcpCapability,
          native: {
            ...activeMcpCapability.native,
            standardsCompliance,
          },
        }),
      ).toMatchObject({
        native: { standardsCompliance },
        axm: { writer: { config: { serversKey: "mcpServers" } } },
      });
    }
  });
  it("allows supported MCP capabilities to omit writer config", () => {
    expect(
      decodeMcpCapability({
        native: {
          availability: { via: "native" },
          vendorStatus: { state: "active" },
          notes: "UI-only surface; no writable MCP config file.",
          docs: [],
          sources: ["https://example.com/mcp"],
          scopes: ["project"],
          standardsCompliance: "none",
          convention: "vendor",
          transports: ["http"],
        },
        axm: {
          status: "supported",
          lastVerified: "2026-06-05",
          writer: null,
        },
      }),
    ).toMatchObject({
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        standardsCompliance: "none",
      },
      axm: {
        status: "supported",
        writer: null,
      },
    });
  });
  it("still requires matching config dialects when writer config is present", () => {
    expect(() =>
      decodeMcpCapability({
        ...activeMcpCapability,
        axm: {
          ...activeMcpCapability.axm,
          writer: {
            config: {
              ...activeMcpCapability.axm.writer.config,
              stdio: null,
            },
          },
        },
      }),
    ).toThrow("MCP stdio config is required when stdio transport is supported.");
    expect(() =>
      decodeMcpCapability({
        ...activeMcpCapability,
        axm: {
          ...activeMcpCapability.axm,
          writer: {
            config: {
              ...activeMcpCapability.axm.writer.config,
              remote: null,
            },
          },
        },
      }),
    ).toThrow("MCP remote config is required when http or sse transport is supported.");
  });
});

describe("Hooks capability schema", () => {
  it("requires native tool mapping names to be unique", () => {
    expect(() =>
      decodeHooksCapability({
        native: {
          availability: { via: "native" },
          vendorStatus: { state: "active" },
          notes: null,
          docs: [],
          sources: ["https://example.com/hooks"],
          scopes: ["project"],
          mechanism: ["command-stdin"],
          configFiles: [],
          events: [
            {
              nativeName: "PreToolUse",
              canonical: "tool.pre",
              matcher: { kind: "regex", example: "Write", notes: null },
              decision: [{ kind: "observe" }],
              sources: ["https://example.com/hooks"],
              lastVerified: "2026-06-06",
            },
          ],
          tools: [
            {
              nativeName: "Write",
              canonical: "file.write",
              sources: ["https://example.com/hooks"],
              lastVerified: "2026-06-06",
            },
            {
              nativeName: "Write",
              canonical: "file.edit",
              sources: ["https://example.com/hooks"],
              lastVerified: "2026-06-06",
            },
          ],
        },
        axm: {
          status: "unsupported",
          writer: null,
          lastVerified: null,
        },
      }),
    ).toThrow("unique nativeName");
  });
  it("allows unmodeled native hook availability with unsupported AXM writer and a reason", () => {
    expect(
      decodeHooksCapability({
        native: {
          availability: { via: "native" },
          vendorStatus: { state: "active" },
          notes: null,
          docs: [],
          sources: ["https://example.com/hooks"],
          scopes: ["project"],
          modeling: "native-unmodeled",
        },
        axm: {
          status: "unsupported",
          writer: null,
          lastVerified: null,
          reason: "In-process plugin writers are not implemented.",
        },
      }),
    ).toMatchObject({
      native: { availability: { via: "native" }, modeling: "native-unmodeled" },
      axm: { writer: null, reason: "In-process plugin writers are not implemented." },
    });
  });
});
