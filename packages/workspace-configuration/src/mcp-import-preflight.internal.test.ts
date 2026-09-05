import { describe, expect, it } from "vitest";
import * as DateTime from "effect/DateTime";

import { preflightMcpImports } from "./mcp-import-preflight.js";

const now = DateTime.makeUnsafe("2026-08-05T00:00:00Z");

describe("MCP import preflight", () => {
  it("deduplicates identical candidates and sorts the result deterministically", () => {
    const result = preflightMcpImports({
      configuredNames: new Set(),
      now,
      sources: [
        {
          filePath: "/workspace/.cursor/mcp.json",
          serversKey: "mcpServers",
          config: {
            mcpServers: {
              zebra: { command: "node", args: ["zebra.js"] },
              alpha: { command: "node", args: ["alpha.js"], env: { TOKEN: "secret" } },
            },
          },
        },
        {
          filePath: "/workspace/.mcp.json",
          serversKey: "mcpServers",
          config: {
            mcpServers: {
              alpha: { command: ["node", "alpha.js"], env: { TOKEN: "different-secret" } },
            },
          },
        },
      ],
    });

    expect(result.conflicts).toEqual([]);
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(["alpha", "zebra"]);
    expect(result.candidates[0]).toMatchObject({
      env: { TOKEN: "${TOKEN}" },
      adoptions: [
        { filePath: "/workspace/.cursor/mcp.json", name: "alpha" },
        { filePath: "/workspace/.mcp.json", name: "alpha" },
      ],
    });
  });

  it("reports same-name configuration conflicts without including secret values", () => {
    const result = preflightMcpImports({
      configuredNames: new Set(),
      now,
      sources: [
        {
          filePath: "/workspace/.mcp.json",
          serversKey: "mcpServers",
          config: {
            mcpServers: {
              demo: { command: "node", args: ["one.js"], env: { TOKEN: "first-secret" } },
            },
          },
        },
        {
          filePath: "/workspace/.cursor/mcp.json",
          serversKey: "mcpServers",
          config: {
            mcpServers: {
              demo: { command: "node", args: ["two.js"], env: { TOKEN: "second-secret" } },
            },
          },
        },
      ],
    });

    expect(result.candidates).toEqual([]);
    expect(result.conflicts).toEqual([
      {
        name: "demo",
        reason: "Conflicting unmanaged configurations were found for demo",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("first-secret");
    expect(JSON.stringify(result)).not.toContain("second-secret");
  });

  it("rejects literal sensitive headers and reports unsupported entries as skipped", () => {
    const result = preflightMcpImports({
      configuredNames: new Set(["configured"]),
      now,
      sources: [
        {
          filePath: "/workspace/.mcp.json",
          serversKey: "mcpServers",
          config: {
            mcpServers: {
              configured: { command: "node" },
              literal: {
                url: "https://example.test/mcp",
                headers: { Authorization: "Bearer private-token" },
              },
              unsupported: { transport: "websocket" },
            },
          },
        },
      ],
    });

    expect(result.candidates).toEqual([]);
    expect(result.skipped).toEqual([
      { name: "configured", reason: "Already configured" },
      { name: "unsupported", reason: "Unsupported MCP server configuration" },
    ]);
    expect(result.conflicts).toEqual([
      {
        name: "literal",
        reason: "Sensitive header Authorization must use an environment reference",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("private-token");
  });

  it("rejects unsupported remote schemes while allowing referenced URL credentials", () => {
    const result = preflightMcpImports({
      configuredNames: new Set(),
      now,
      sources: [
        {
          filePath: "/workspace/.mcp.json",
          serversKey: "mcpServers",
          config: {
            mcpServers: {
              referenced: { url: "https://${MCP_USER}:${MCP_PASSWORD}@example.test/mcp" },
              unsupported: { url: "file:///workspace/server.sock" },
            },
          },
        },
      ],
    });

    expect(result.candidates.map((candidate) => candidate.name)).toEqual(["referenced"]);
    expect(result.conflicts).toEqual([
      {
        name: "unsupported",
        reason: "Unsupported MCP server URL scheme; use an http(s) URL",
      },
    ]);
  });

  it("rejects literal secrets in command arguments and extra fields", () => {
    const result = preflightMcpImports({
      configuredNames: new Set(),
      now,
      sources: [
        {
          filePath: "/workspace/.mcp.json",
          serversKey: "mcpServers",
          config: {
            mcpServers: {
              argument: { command: "server", args: ["--api-key", "private-argument"] },
              field: { command: "server", token: "private-field" },
              referenced: { command: "server", args: ["--token=${MCP_TOKEN}"] },
            },
          },
        },
      ],
    });

    expect(result.candidates.map((candidate) => candidate.name)).toEqual(["referenced"]);
    expect(result.conflicts).toEqual([
      {
        name: "argument",
        reason: "Sensitive argument api-key must use an environment reference",
      },
      {
        name: "field",
        reason: "Sensitive field token must use an environment reference",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("private-argument");
    expect(JSON.stringify(result)).not.toContain("private-field");
  });
});
