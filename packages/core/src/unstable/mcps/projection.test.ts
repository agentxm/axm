import { describe, expect, it } from "@effect/vitest";
import { AGENTS_BY_ID } from "../agent-capabilities/index.js";

import {
  diffAgentEntry,
  inferInlineRemoteTransport,
  projectExpectedEntry,
  renderEnvValue,
} from "./projection.js";

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
    expect(
      renderEnvValue("Bearer ${TOKEN}", {
        variables: "none",
        defaults: false,
      }),
    ).toEqual({
      value: "Bearer ${TOKEN}",
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
        "x-axm": { managed: true, source: "inline" },
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

  it("projects Codex secret-backed headers through environment fields", () => {
    const projected = projectExpectedEntry({
      serverName: "demo",
      entry: {
        source: "inline",
        url: "https://example.test/mcp",
        headers: {
          Authorization: "Bearer ${TOKEN}",
          "X-Api-Key": "${API_KEY}",
          Accept: "application/json",
        },
        enabled: true,
        env: {},
      },
      stdio: null,
      remote: {
        typeField: null,
        urlKey: {
          "streamable-http": "url",
        },
        headersKey: "http_headers",
        bearerTokenEnvKey: "bearer_token_env_var",
        envHeadersKey: "env_http_headers",
      },
      nativeEnabled: true,
      envExpansion: {
        variables: "none",
        defaults: false,
      },
    });

    expect(projected).toEqual({
      _tag: "projected",
      warnings: [],
      entry: {
        "x-axm": { managed: true, source: "inline" },
        enabled: true,
        url: "https://example.test/mcp",
        http_headers: { Accept: "application/json" },
        bearer_token_env_var: "TOKEN",
        env_http_headers: { "X-Api-Key": "API_KEY" },
      },
    });
  });

  it("warns and omits secret-backed headers when the dialect has no environment fields", () => {
    const projected = projectExpectedEntry({
      serverName: "demo",
      entry: {
        source: "inline",
        url: "https://example.test/mcp",
        headers: { Authorization: "Bearer ${TOKEN}" },
        enabled: true,
        env: {},
      },
      stdio: null,
      remote: {
        typeField: null,
        urlKey: { "streamable-http": "url" },
        headersKey: "headers",
      },
      nativeEnabled: true,
      envExpansion: {
        variables: "none",
        defaults: false,
      },
    });

    expect(projected).toEqual({
      _tag: "projected",
      warnings: [
        "headers.Authorization: cannot project environment reference ${TOKEN} for this agent",
      ],
      entry: {
        "x-axm": { managed: true, source: "inline" },
        enabled: true,
        url: "https://example.test/mcp",
      },
    });
  });

  it("projects Gemini CLI remote servers through its current HTTP dialect", () => {
    const capability = AGENTS_BY_ID["gemini-cli"].capabilities["mcp-server"];
    const writer = capability.axm.writer;
    if (writer === null) throw new Error("Gemini CLI MCP writer is unavailable");

    const projected = projectExpectedEntry({
      serverName: "demo",
      entry: {
        source: "inline",
        url: "https://example.test/mcp",
        headers: { Authorization: "Bearer ${TOKEN}" },
        enabled: true,
        env: {},
      },
      stdio: writer.config.stdio,
      remote: writer.config.remote,
      nativeEnabled: writer.config.nativeEnabled,
      envExpansion: capability.native.mcpEnvExpansion,
    });

    expect(projected).toEqual({
      _tag: "projected",
      warnings: [],
      entry: {
        "x-axm": { managed: true, source: "inline" },
        httpUrl: "https://example.test/mcp",
        headers: { Authorization: "Bearer ${TOKEN}" },
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
        "x-axm": { managed: true, source: "inline" },
        type: "stdio",
        enabled: true,
        command: "npx",
        args: ["-y", "@acme/context"],
        env: { ACME_TOKEN: "secret" },
      },
    });
  });

  it("compares nested metadata without reporting order-only drift", () => {
    const expected = projectExpectedEntry({
      serverName: "demo",
      entry: {
        source: "inline",
        command: "npx",
        args: ["-y", "@acme/context"],
        env: {},
        enabled: true,
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

    expect(
      diffAgentEntry(expected, {
        "x-axm": { source: "inline", managed: true },
        type: "stdio",
        enabled: true,
        command: "npx",
        args: ["-y", "@acme/context"],
      }),
    ).toEqual({ _tag: "match" });
  });
});
