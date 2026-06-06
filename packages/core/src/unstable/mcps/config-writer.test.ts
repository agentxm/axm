import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import * as Result from "effect/Result";
import { removeAgentMcpConfig, writeAgentMcpConfig } from "./config-writer.js";

const withNode = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

const withFailingConfigWrite = <A, E, R>(effect: Effect.Effect<A, E, R>, configPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const failingFs = {
      ...fs,
      writeFileString: (path, data, options) =>
        path === configPath
          ? Effect.fail(
              PlatformError.systemError({
                _tag: "PermissionDenied",
                module: "FileSystem",
                method: "writeFileString",
                pathOrDescriptor: path,
              }),
            )
          : fs.writeFileString(path, data, options),
    } satisfies FileSystem.FileSystem;
    return yield* effect.pipe(Effect.provideService(FileSystem.FileSystem, failingFs));
  }).pipe(Effect.provide(NodeServices.layer));

describe("agent MCP config writer", () => {
  it.effect(
    "updates JSONC config while preserving unrelated content without a workspace backup",
    () =>
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
            expect(existsSync(`${configPath}.bak`)).toBe(false);
            expect(result.targets).toEqual([{ path: "agent.jsonc", change: "updated" }]);
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
          expect(existsSync(`${configPath}.bak`)).toBe(false);
          expect(result.targets).toEqual([{ path: "agent.json", change: "updated" }]);
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
          expect(existsSync(`${configPath}.bak`)).toBe(false);
          expect(writeResult.targets).toEqual([{ path: "agent.toml", change: "updated" }]);

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
          expect(existsSync(`${configPath}.bak`)).toBe(false);
          expect(removeResult.targets).toEqual([{ path: "agent.toml", change: "updated" }]);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("creates no backup when writing a new config file", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-new-"));
        try {
          const configPath = nodePath.join(workspaceRoot, "agent.json");

          const result = yield* writeAgentMcpConfig({
            workspaceRoot,
            serverName: "context",
            serversKey: "mcpServers",
            target: { scope: "project", path: "agent.json", format: "json" },
            entry: { command: "npx" },
          });

          expect(readFileSync(configPath, "utf8")).toContain('"context"');
          expect(existsSync(`${configPath}.bak`)).toBe(false);
          expect(result.targets).toEqual([{ path: "agent.json", change: "created" }]);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("retains a temporary backup path when a changed config write fails", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-failed-write-"));
      try {
        const configPath = nodePath.join(workspaceRoot, "agent.json");
        const original = '{\n  "mcpServers": {}\n}\n';
        writeFileSync(configPath, original);

        const result = yield* withFailingConfigWrite(
          writeAgentMcpConfig({
            workspaceRoot,
            serverName: "context",
            serversKey: "mcpServers",
            target: { scope: "project", path: "agent.json", format: "json" },
            entry: { command: "npx" },
          }).pipe(Effect.result),
          configPath,
        );

        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result)) {
          expect(result.failure.detail).toContain(`Failed to write MCP config: ${configPath}`);
          const backupMatch = result.failure.detail.match(
            /Original file backup retained at: (.+)$/,
          );
          const backupPath = backupMatch?.[1];
          expect(backupPath).toBeDefined();
          if (backupPath !== undefined) {
            expect(readFileSync(backupPath, "utf8")).toBe(original);
            expect(backupPath).not.toBe(`${configPath}.bak`);
          }
        }
        expect(readFileSync(configPath, "utf8")).toBe(original);
        expect(existsSync(`${configPath}.bak`)).toBe(false);
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );
});
