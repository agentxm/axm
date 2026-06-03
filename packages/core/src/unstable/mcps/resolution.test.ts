import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import type { McpExtensionCapability } from "../agent-capabilities/index.js";
import { McpServerManifestSchema } from "./manifest-schema.js";
import { resolveMcpServer } from "./resolution.js";

const decodeManifest = Schema.decodeUnknownSync(McpServerManifestSchema);

const stdioCapability = {
  standardsCompliance: "full",
  convention: "universal",
  lifecycle: "supported",
  notes: null,
  docs: [],
  sources: ["https://example.com/mcp"],
  lastVerified: "2026-05-16",
  scopes: ["project"],
  transports: ["stdio"],
  config: {
    serversKey: "mcpServers",
    nativeEnabled: true,
    targets: [{ scope: "project", path: ".mcp.json", format: "json" }],
    stdio: {
      typeField: null,
      command: "split",
      envKey: "env",
    },
    remote: null,
    transform: null,
  },
} satisfies McpExtensionCapability;

const remoteCapability = {
  standardsCompliance: "full",
  convention: "universal",
  lifecycle: "supported",
  notes: null,
  docs: [],
  sources: ["https://example.com/mcp"],
  lastVerified: "2026-05-16",
  scopes: ["project"],
  transports: ["http", "stdio"],
  config: {
    serversKey: "mcpServers",
    nativeEnabled: true,
    targets: [{ scope: "project", path: ".mcp.json", format: "json" }],
    stdio: {
      typeField: null,
      command: "array",
      envKey: "env",
    },
    remote: {
      typeField: {
        name: "type",
        value: { "streamable-http": "http", sse: "sse" },
      },
      urlKey: { "streamable-http": "url", sse: "url" },
      headersKey: "headers",
    },
    transform: null,
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
        command: "npx",
        args: ["-y", "@acme/context-mcp@1.2.3"],
        env: { ACME_TOKEN: "secret" },
        enabled: true,
      });
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
        type: "http",
        url: "https://mcp.acme.test/prod",
      });
    }
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
