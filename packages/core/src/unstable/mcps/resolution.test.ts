import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import type { McpExtensionCapability } from "../agent-capabilities/index.js";
import { McpServerManifestSchema } from "./manifest-schema.js";
import { resolveMcpServer } from "./resolution.js";
const decodeManifest = Schema.decodeUnknownSync(McpServerManifestSchema);
const stdioCapability = {
  native: {
    standardsCompliance: "full",
    convention: "universal",
    availability: { via: "native" },
    vendorStatus: { state: "active" },
    notes: null,
    docs: [],
    sources: ["https://example.com/mcp"],
    scopes: ["project"],
    transports: ["stdio"],
    mcpEnvExpansion: { variables: "braced", defaults: false },
  },
  axm: {
    status: "supported",
    lastVerified: "2026-05-16",
    writer: {
      config: {
        serversKey: "mcpServers",
        activationField: {
          required: { name: "enabled", enabled: true, disabled: false },
          accepted: [{ name: "enabled", enabled: true, disabled: false }],
        },
        targets: [{ scope: "project", path: ".mcp.json", format: "json" }],
        stdio: {
          typeField: { required: null, accepted: [null] },
          command: "split",
          envKey: "env",
        },
        remote: null,
      },
    },
  },
} satisfies McpExtensionCapability;
const remoteCapability = {
  native: {
    standardsCompliance: "full",
    convention: "universal",
    availability: { via: "native" },
    vendorStatus: { state: "active" },
    notes: null,
    docs: [],
    sources: ["https://example.com/mcp"],
    scopes: ["project"],
    transports: ["http", "stdio"],
  },
  axm: {
    status: "supported",
    lastVerified: "2026-05-16",
    writer: {
      config: {
        serversKey: "mcpServers",
        activationField: {
          required: { name: "enabled", enabled: true, disabled: false },
          accepted: [{ name: "enabled", enabled: true, disabled: false }],
        },
        targets: [{ scope: "project", path: ".mcp.json", format: "json" }],
        stdio: {
          typeField: { required: null, accepted: [null] },
          command: "array",
          envKey: "env",
        },
        remote: {
          typeField: {
            required: {
              name: "type",
              value: { "streamable-http": "http", sse: "sse" },
            },
            accepted: [
              {
                name: "type",
                value: { "streamable-http": "http", sse: "sse" },
              },
            ],
          },
          urlKey: { "streamable-http": "url", sse: "url" },
          headersKey: "headers",
        },
      },
    },
  },
} satisfies McpExtensionCapability;
const partialRemoteCapability = {
  ...remoteCapability,
  native: {
    ...remoteCapability.native,
    standardsCompliance: "partial",
    notes: "Config dialect is verified, but native semantics diverge from full MCP format.",
  },
} satisfies McpExtensionCapability;
const httpOnlyRemoteCapability = {
  ...remoteCapability,
  native: {
    ...remoteCapability.native,
    transports: ["http"],
  },
  axm: {
    ...remoteCapability.axm,
    writer: {
      config: {
        ...remoteCapability.axm.writer.config,
        stdio: null,
        remote: {
          typeField: {
            required: {
              name: "type",
              value: { "streamable-http": "http" },
            },
            accepted: [
              {
                name: "type",
                value: { "streamable-http": "http" },
              },
            ],
          },
          urlKey: { "streamable-http": "url" },
          headersKey: "headers",
        },
      },
    },
  },
} satisfies McpExtensionCapability;
const manifest = (server: Record<string, unknown>) =>
  decodeManifest({
    owner: "@acme",
    type: "mcp-server",
    name: "context",
    version: "1.0.0",
    server: {
      name: "io.github.acme/context",
      description: "Context MCP server",
      version: "1.0.0",
      ...server,
    },
  });
describe("resolveMcpServer", () => {
  it("resolves stdio packages into agent dialect config", () => {
    const result = resolveMcpServer({
      manifest: manifest({
        packages: [
          {
            registryType: "npm",
            identifier: "@acme/context-mcp",
            version: "1.2.3",
            transport: { type: "stdio" },
            environmentVariables: [{ name: "ACME_TOKEN", isRequired: true }],
          },
        ],
      }),
      capability: stdioCapability,
      values: { ACME_TOKEN: "secret" },
      enabled: true,
    });
    expect(result._tag).toBe("resolved");
    if (result._tag === "resolved") {
      expect(result.entry).toMatchObject({
        "x-axm": { managed: true, source: "registry", ref: "@acme/mcps/context" },
        command: "npx",
        args: ["-y", "@acme/context-mcp@1.2.3"],
        env: { ACME_TOKEN: "secret" },
        enabled: true,
      });
    }
  });

  it("keeps declared secret inputs as references in native config", () => {
    const result = resolveMcpServer({
      manifest: manifest({
        packages: [
          {
            registryType: "npm",
            identifier: "@acme/context-mcp",
            transport: { type: "stdio" },
            environmentVariables: [{ name: "ACME_TOKEN", isRequired: true, isSecret: true }],
          },
        ],
      }),
      capability: stdioCapability,
      values: { ACME_TOKEN: "secret" },
      enabled: true,
    });

    expect(result._tag).toBe("resolved");
    if (result._tag === "resolved") {
      expect(result.entry).toMatchObject({ env: { ACME_TOKEN: "${ACME_TOKEN}" } });
      expect(JSON.stringify(result.entry)).not.toContain("secret");
    }
  });
  it("prefers native remotes when the agent supports HTTP", () => {
    const result = resolveMcpServer({
      manifest: manifest({
        packages: [
          {
            registryType: "npm",
            identifier: "@acme/context-mcp",
            version: "1.2.3",
            transport: { type: "stdio" },
          },
        ],
        remotes: [{ type: "streamable-http", url: "https://mcp.acme.test/{tenant}" }],
      }),
      capability: remoteCapability,
      values: { tenant: "prod" },
      enabled: true,
    });
    expect(result._tag).toBe("resolved");
    if (result._tag === "resolved") {
      expect(result.transport).toBe("streamable-http");
      expect(result.shimmed).toBe(false);
      expect(result.entry).toMatchObject({
        "x-axm": { managed: true, source: "registry", ref: "@acme/mcps/context" },
        type: "http",
        url: "https://mcp.acme.test/prod",
      });
    }
  });
  it("resolves through writer config even when MCP compliance is partial", () => {
    const result = resolveMcpServer({
      manifest: manifest({
        remotes: [{ type: "streamable-http", url: "https://mcp.acme.test/{tenant}" }],
      }),
      capability: partialRemoteCapability,
      values: { tenant: "prod" },
      enabled: true,
    });
    expect(result._tag).toBe("resolved");
    if (result._tag === "resolved") {
      expect(result.entry).toMatchObject({
        type: "http",
        url: "https://mcp.acme.test/prod",
      });
    }
  });
  it("does not project SSE remotes when the target dialect omits SSE", () => {
    const result = resolveMcpServer({
      manifest: manifest({
        remotes: [{ type: "sse", url: "https://mcp.acme.test/sse" }],
      }),
      capability: httpOnlyRemoteCapability,
      values: {},
      enabled: true,
    });
    expect(result).toEqual({
      _tag: "no-distribution",
      reason: "no MCP distribution is viable for this agent",
    });
  });
  it("falls back to an mcp-remote stdio shim for remote-only servers", () => {
    const result = resolveMcpServer({
      manifest: manifest({
        remotes: [{ type: "streamable-http", url: "https://mcp.acme.test" }],
      }),
      capability: stdioCapability,
      values: {},
      enabled: true,
    });
    expect(result._tag).toBe("resolved");
    if (result._tag === "resolved") {
      expect(result.shimmed).toBe(true);
      expect(result.entry).toMatchObject({
        "x-axm": { managed: true, source: "registry", ref: "@acme/mcps/context" },
        command: "npx",
        args: ["-y", "mcp-remote", "https://mcp.acme.test"],
      });
    }
  });
  it("returns needs-input with placeholders for missing required values", () => {
    const result = resolveMcpServer({
      manifest: manifest({
        packages: [
          {
            registryType: "npm",
            identifier: "@acme/context-mcp",
            version: "1.2.3",
            transport: { type: "stdio" },
            environmentVariables: [{ name: "ACME_TOKEN", isRequired: true }],
          },
        ],
      }),
      capability: stdioCapability,
      values: {},
      enabled: true,
    });
    expect(result._tag).toBe("needs-input");
    if (result._tag === "needs-input") {
      expect(result.missing).toEqual(["ACME_TOKEN"]);
      expect(result.entry).toMatchObject({ env: { ACME_TOKEN: "${ACME_TOKEN}" } });
    }
  });
  it("reports nothing-runnable for tombstone manifests", () => {
    const result = resolveMcpServer({
      manifest: manifest({}),
      capability: stdioCapability,
      values: {},
      enabled: true,
    });
    expect(result).toMatchObject({ _tag: "nothing-runnable" });
  });
});
