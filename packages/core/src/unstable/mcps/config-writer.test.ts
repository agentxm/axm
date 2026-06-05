import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { removeAgentMcpConfig, writeAgentMcpConfig } from "./config-writer.js";

const withNode = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

describe("agent MCP config writer", () => {
  it.effect("updates JSONC config while preserving unrelated content and writing a backup", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-jsonc-"));
        try {
          const configPath = nodePath.join(workspaceRoot, "agent.jsonc");
          writeFileSync(configPath, '{\n  // keep this\n  "mcpServers": {}\n}\n');

          const result = yield* writeAgentMcpConfig({
            workspaceRoot,
            serverName: "context",
            serversKey: "mcpServers",
            target: { scope: "project", path: "agent.jsonc", format: "jsonc" },
            entry: {
              command: "npx",
              args: ["-y", "@acme/context-mcp@1.0.0"],
              env: { ACME_TOKEN: "secret" },
              enabled: true,
            },
          });

          const raw = readFileSync(configPath, "utf8");
          expect(raw).toContain("// keep this");
          expect(raw).toContain('"context"');
          expect(raw).toContain('"ACME_TOKEN": "secret"');
          expect(readFileSync(`${configPath}.bak`, "utf8")).toContain('"mcpServers": {}');
          expect(result.targets).toEqual([
            { path: "agent.jsonc", change: "updated" },
            { path: "agent.jsonc.bak", change: "created" },
          ]);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("removes JSON config entries", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-json-"));
        try {
          const configPath = nodePath.join(workspaceRoot, "agent.json");
          writeFileSync(configPath, '{\n  "mcpServers": { "context": { "command": "npx" } }\n}\n');

          const result = yield* removeAgentMcpConfig({
            workspaceRoot,
            serverName: "context",
            serversKey: "mcpServers",
            target: { scope: "project", path: "agent.json", format: "json" },
            nativeEnabled: false,
            disableOnly: false,
          });

          expect(readFileSync(configPath, "utf8")).not.toContain('"context"');
          expect(result.targets).toEqual([
            { path: "agent.json", change: "updated" },
            { path: "agent.json.bak", change: "created" },
          ]);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("writes managed TOML blocks and removes them cleanly", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-toml-"));
        try {
          const configPath = nodePath.join(workspaceRoot, "agent.toml");
          writeFileSync(configPath, 'model = "gpt-5"\n');

          const writeResult = yield* writeAgentMcpConfig({
            workspaceRoot,
            serverName: "context",
            serversKey: "mcp_servers",
            target: { scope: "project", path: "agent.toml", format: "toml" },
            entry: {
              command: "npx",
              args: ["-y", "@acme/context-mcp@1.0.0"],
            },
          });

          expect(readFileSync(configPath, "utf8")).toContain(
            "# axm managed mcp-server context start",
          );
          expect(writeResult.targets).toEqual([
            { path: "agent.toml", change: "updated" },
            { path: "agent.toml.bak", change: "created" },
          ]);

          const removeResult = yield* removeAgentMcpConfig({
            workspaceRoot,
            serverName: "context",
            serversKey: "mcp_servers",
            target: { scope: "project", path: "agent.toml", format: "toml" },
            nativeEnabled: false,
            disableOnly: false,
          });

          const raw = readFileSync(configPath, "utf8");
          expect(raw).toBe('model = "gpt-5"\n');
          expect(removeResult.targets).toEqual([
            { path: "agent.toml", change: "updated" },
            { path: "agent.toml.bak", change: "updated" },
          ]);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );
});
