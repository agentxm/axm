import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import { AGENTS, type McpEntryDialect } from "@agentxm/extension-model/unstable/agent-capabilities";
import { interpretNativeMcpEntry } from "./reader-semantics.js";

const dialect = (id: string): McpEntryDialect => {
  const native = AGENTS.find((agent) => agent.id === id)?.capabilities["mcp-server"].native;
  if (native === undefined || !("entryDialect" in native) || native.entryDialect === null)
    throw new Error(`Missing native MCP dialect for ${id}`);
  return native.entryDialect;
};

describe("native MCP transport interpretation", () => {
  const remote = { url: "https://example.test/mcp", headers: { Authorization: "Bearer example" } };

  it("normalizes OpenCode's native reference spelling without resolving its value", () => {
    const interpreted = interpretNativeMcpEntry({
      entry: {
        type: "local",
        command: ["node", "{env:SCRIPT}"],
        environment: { TOKEN: "{env:OTHER}" },
        disabled: true,
      },
      config: dialect("opencode"),
      transports: ["stdio", "http"],
      envExpansion: { variables: "env-tag", defaults: false },
    });
    expect(interpreted).toEqual(
      Option.some({
        transport: "stdio",
        invocation: ["node", { environmentTemplate: [{ variable: "SCRIPT" }] }],
        env: { TOKEN: { environmentTemplate: [{ variable: "OTHER" }] } },
        forwarded: [],
        cwd: { kind: "host-default" },
        enabled: false,
      }),
    );
  });

  it("distinguishes a literal braced placeholder from an expanded one", () => {
    const entry = { type: "local", command: ["node"], environment: { TOKEN: "${TOKEN}" } };
    const common = { entry, config: dialect("opencode"), transports: ["stdio"] as const };
    const literal = interpretNativeMcpEntry({
      ...common,
      envExpansion: { variables: "env-tag", defaults: false },
    });
    const reference = interpretNativeMcpEntry({
      ...common,
      envExpansion: { variables: "braced", defaults: false },
    });
    expect(literal).not.toEqual(reference);
  });

  it("represents documented remote autodetection without claiming one selected transport", () => {
    expect(
      interpretNativeMcpEntry({
        entry: remote,
        config: dialect("cursor"),
        transports: ["http", "sse"],
      }),
    ).toEqual(
      Option.some({
        transport: "http-or-sse",
        url: remote.url,
        headers: remote.headers,
        bearer: null,
        envHeaders: {},
        enabled: true,
      }),
    );
  });

  it("refuses an undocumented ambiguous remote transport", () => {
    const config = dialect("cursor");
    if (config.remote === null) throw new Error("Expected Cursor remote dialect");
    const unknown: McpEntryDialect = {
      ...config,
      remote: {
        typeField: config.remote.typeField,
        urlKey: config.remote.urlKey,
        headersKey: config.remote.headersKey,
      },
    };
    expect(
      interpretNativeMcpEntry({ entry: remote, config: unknown, transports: ["http", "sse"] }),
    ).toEqual(Option.none());
  });

  it("keeps explicit remote transports distinct and rejects missing discriminators", () => {
    const config = dialect("claude-code");
    const http = interpretNativeMcpEntry({
      entry: { ...remote, type: "http" },
      config,
      transports: ["http", "sse"],
    });
    const sse = interpretNativeMcpEntry({
      entry: { ...remote, type: "sse" },
      config,
      transports: ["http", "sse"],
    });
    expect(Option.map(http, (entry) => entry["transport"])).toEqual(Option.some("streamable-http"));
    expect(Option.map(sse, (entry) => entry["transport"])).toEqual(Option.some("sse"));
    expect(interpretNativeMcpEntry({ entry: remote, config, transports: ["http", "sse"] })).toEqual(
      Option.none(),
    );
  });

  it("does not collapse conflicting remote endpoints or invalid payloads", () => {
    const config = dialect("cursor");
    if (config.remote === null) throw new Error("Expected Cursor remote dialect");
    const split: McpEntryDialect = {
      ...config,
      remote: { ...config.remote, urlKey: { "streamable-http": "httpUrl", sse: "sseUrl" } },
    };
    expect(
      interpretNativeMcpEntry({
        entry: { httpUrl: remote.url, sseUrl: "https://other.test/sse" },
        config: split,
        transports: ["http", "sse"],
      }),
    ).toEqual(Option.none());
    expect(
      interpretNativeMcpEntry({
        entry: { ...remote, headers: { broken: 42 } },
        config,
        transports: ["http", "sse"],
      }),
    ).toEqual(Option.none());
  });
});
