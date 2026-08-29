import { describe, expect, it } from "@effect/vitest";
import { AGENTS_BY_ID } from "../agent-capabilities/index.js";

import {
  diffAgentEntry,
  inferInlineRemoteTransport,
  projectExpectedEntry,
  renderEnvValue,
} from "./projection.js";

describe("MCP projection", () => {
  it("returns an unsupported result for WebSocket URLs without throwing", () => {
    expect(inferInlineRemoteTransport("wss://example.test/mcp")).toEqual({
      _tag: "unsupported",
      reason: "WebSocket MCP transport is not supported",
    });
  });

  it("keeps HTTP SSE and streamable URLs distinct", () => {
    expect(inferInlineRemoteTransport("https://example.test/sse")).toEqual({
      _tag: "supported",
      transport: "sse",
    });
    expect(inferInlineRemoteTransport("https://example.test/mcp")).toEqual({
      _tag: "supported",
      transport: "streamable-http",
    });
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
          required: {
            name: "type",
            value: {
              "streamable-http": "http",
              sse: "sse",
            },
          },
          accepted: [
            {
              name: "type",
              value: {
                "streamable-http": "http",
                sse: "sse",
              },
            },
          ],
        },
        urlKey: {
          "streamable-http": "url",
          sse: "url",
        },
        headersKey: "headers",
      },
      activationField: {
        required: { name: "enabled", enabled: true, disabled: false },
        accepted: [{ name: "enabled", enabled: true, disabled: false }],
      },
    });

    expect(projected).toEqual({
      _tag: "projected",
      warnings: [],
      entry: {
        "x-axm": {
          v: 1,
          managed: true,
          ext: "@workspace/mcps/demo",
          source: "inline",
        },
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
          required: {
            name: "type",
            value: {
              "streamable-http": "http",
            },
          },
          accepted: [
            {
              name: "type",
              value: {
                "streamable-http": "http",
              },
            },
          ],
        },
        urlKey: {
          "streamable-http": "url",
        },
        headersKey: "headers",
      },
      activationField: {
        required: { name: "enabled", enabled: true, disabled: false },
        accepted: [{ name: "enabled", enabled: true, disabled: false }],
      },
    });

    expect(projected).toEqual({
      _tag: "unsupported",
      reason: "agent does not support the sse remote transport",
    });
  });

  it("explains the inline-only remote limitation and stdio shim recovery", () => {
    const projected = projectExpectedEntry({
      serverName: "demo",
      entry: {
        source: "inline",
        url: "https://example.test/mcp",
        headers: { Authorization: "Bearer ${TOKEN}" },
        enabled: true,
        env: {},
      },
      stdio: {
        typeField: { required: null, accepted: [null] },
        command: "split",
        envKey: "env",
      },
      remote: null,
      activationField: {
        required: { name: "enabled", enabled: true, disabled: false },
        accepted: [{ name: "enabled", enabled: true, disabled: false }],
      },
    });

    expect(projected).toEqual({
      _tag: "unsupported",
      reason:
        'this agent cannot project inline URL entries; use the supported stdio shim instead: `axm mcps add demo --command "npx -y mcp-remote https://example.test/mcp"`. Preserve required headers by appending `--header "Header:${ENV_VAR}"` to the shim command and pass `ENV_VAR` with `--env ENV_VAR`.',
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
        typeField: { required: null, accepted: [null] },
        urlKey: {
          "streamable-http": "url",
        },
        headersKey: "http_headers",
        bearerTokenEnvKey: "bearer_token_env_var",
        envHeadersKey: "env_http_headers",
      },
      activationField: {
        required: { name: "enabled", enabled: true, disabled: false },
        accepted: [{ name: "enabled", enabled: true, disabled: false }],
      },
      envExpansion: {
        variables: "none",
        defaults: false,
      },
    });

    expect(projected).toEqual({
      _tag: "projected",
      warnings: [],
      entry: {
        "x-axm": {
          v: 1,
          managed: true,
          ext: "@workspace/mcps/demo",
          source: "inline",
        },
        enabled: true,
        url: "https://example.test/mcp",
        http_headers: { Accept: "application/json" },
        bearer_token_env_var: "TOKEN",
        env_http_headers: { "X-Api-Key": "API_KEY" },
      },
    });
  });

  it("blocks secret-backed headers when the dialect has no environment fields", () => {
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
        typeField: { required: null, accepted: [null] },
        urlKey: { "streamable-http": "url" },
        headersKey: "headers",
      },
      activationField: {
        required: { name: "enabled", enabled: true, disabled: false },
        accepted: [{ name: "enabled", enabled: true, disabled: false }],
      },
      envExpansion: {
        variables: "none",
        defaults: false,
      },
    });

    expect(projected).toEqual({
      _tag: "unsupported",
      reason: "headers.Authorization: cannot project environment reference ${TOKEN} for this agent",
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
      activationField: writer.config.activationField,
      envExpansion: capability.native.mcpEnvExpansion,
    });

    expect(projected).toEqual({
      _tag: "projected",
      warnings: [],
      entry: {
        "x-axm": {
          v: 1,
          managed: true,
          ext: "@workspace/mcps/demo",
          source: "inline",
        },
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
          required: {
            name: "type",
            value: "stdio",
          },
          accepted: [
            {
              name: "type",
              value: "stdio",
            },
          ],
        },
        command: "split",
        envKey: "env",
      },
      remote: null,
      activationField: {
        required: { name: "enabled", enabled: true, disabled: false },
        accepted: [{ name: "enabled", enabled: true, disabled: false }],
      },
    });

    expect(projected).toEqual({
      _tag: "projected",
      warnings: [],
      entry: {
        "x-axm": {
          v: 1,
          managed: true,
          ext: "@workspace/mcps/demo",
          source: "inline",
        },
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
          required: {
            name: "type",
            value: "stdio",
          },
          accepted: [
            {
              name: "type",
              value: "stdio",
            },
          ],
        },
        command: "split",
        envKey: "env",
      },
      remote: null,
      activationField: {
        required: { name: "enabled", enabled: true, disabled: false },
        accepted: [{ name: "enabled", enabled: true, disabled: false }],
      },
    });

    expect(
      diffAgentEntry(expected, {
        "x-axm": {
          source: "inline",
          ext: "@workspace/mcps/demo",
          managed: true,
          v: 1,
        },
        type: "stdio",
        enabled: true,
        command: "npx",
        args: ["-y", "@acme/context"],
      }),
    ).toEqual({ _tag: "match" });
  });
});
