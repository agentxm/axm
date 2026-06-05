import { describe, expect, it } from "@effect/vitest";

import { inferInlineRemoteTransport, projectExpectedEntry, renderEnvValue } from "./projection.js";

describe("MCP projection", () => {
  it("rejects WebSocket URLs instead of coercing them to streamable HTTP", () => {
    expect(() => inferInlineRemoteTransport("wss://example.test/mcp")).toThrow(
      "WebSocket MCP transport is not supported",
    );
  });

  it("keeps HTTP SSE and streamable URLs distinct", () => {
    expect(inferInlineRemoteTransport("https://example.test/sse")).toBe("sse");
    expect(inferInlineRemoteTransport("https://example.test/mcp")).toBe("streamable-http");
  });

  it("renders environment references according to target capability", () => {
    expect(
      renderEnvValue("${TOKEN:-fallback}", {
        variables: "braced",
        defaults: true,
      }),
    ).toEqual({ value: "${TOKEN:-fallback}" });
    expect(
      renderEnvValue("${TOKEN:-fallback}", {
        variables: "braced",
        defaults: false,
      }),
    ).toEqual({
      value: "${TOKEN:-fallback}",
      warning: "does not expand environment default ${TOKEN:-fallback}",
    });
    expect(
      renderEnvValue("${TOKEN}", {
        variables: "none",
        defaults: false,
      }),
    ).toEqual({
      value: "${TOKEN}",
      warning: "does not expand environment reference ${TOKEN}",
    });
  });

  it("projects an inline remote server through a target dialect", () => {
    const projected = projectExpectedEntry({
      serverName: "demo",
      entry: {
        source: "inline",
        url: "https://example.test/mcp",
        headers: {},
        enabled: true,
        authored: false,
        env: {},
      },
      stdio: null,
      remote: {
        typeField: {
          name: "type",
          value: {
            "streamable-http": "http",
            sse: "sse",
          },
        },
        urlKey: {
          "streamable-http": "url",
          sse: "url",
        },
        headersKey: "headers",
      },
      nativeEnabled: true,
    });

    expect(projected).toEqual({
      _tag: "projected",
      warnings: [],
      entry: {
        managedBy: "axm",
        type: "http",
        enabled: true,
        url: "https://example.test/mcp",
      },
    });
  });

  it("returns unsupported when an inferred SSE URL has no target dialect mapping", () => {
    const projected = projectExpectedEntry({
      serverName: "demo",
      entry: {
        source: "inline",
        url: "https://example.test/sse",
        headers: {},
        enabled: true,
        authored: false,
        env: {},
      },
      stdio: null,
      remote: {
        typeField: {
          name: "type",
          value: {
            "streamable-http": "http",
          },
        },
        urlKey: {
          "streamable-http": "url",
        },
        headersKey: "headers",
      },
      nativeEnabled: true,
    });

    expect(projected).toEqual({
      _tag: "unsupported",
      reason: "agent does not support the sse remote transport",
    });
  });

  it("projects Codex remote servers without a type field", () => {
    const projected = projectExpectedEntry({
      serverName: "demo",
      entry: {
        source: "inline",
        url: "https://example.test/mcp",
        headers: { Authorization: "${TOKEN}" },
        enabled: true,
        authored: false,
        env: {},
      },
      stdio: null,
      remote: {
        typeField: null,
        urlKey: {
          "streamable-http": "url",
        },
        headersKey: "http_headers",
      },
      nativeEnabled: true,
    });

    expect(projected).toEqual({
      _tag: "projected",
      warnings: ["headers.Authorization: does not expand environment reference ${TOKEN}"],
      entry: {
        managedBy: "axm",
        enabled: true,
        url: "https://example.test/mcp",
        http_headers: { Authorization: "${TOKEN}" },
      },
    });
  });

  it("keeps stdio projection unchanged", () => {
    const projected = projectExpectedEntry({
      serverName: "demo",
      entry: {
        source: "inline",
        command: "npx",
        args: ["-y", "@acme/context"],
        env: { ACME_TOKEN: "secret" },
        enabled: true,
        authored: false,
      },
      stdio: {
        typeField: {
          name: "type",
          value: "stdio",
        },
        command: "split",
        envKey: "env",
      },
      remote: null,
      nativeEnabled: true,
    });

    expect(projected).toEqual({
      _tag: "projected",
      warnings: [],
      entry: {
        managedBy: "axm",
        type: "stdio",
        enabled: true,
        command: "npx",
        args: ["-y", "@acme/context"],
        env: { ACME_TOKEN: "secret" },
      },
    });
  });
});
