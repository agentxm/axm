import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import * as Result from "effect/Result";
import { parse as parseToml } from "smol-toml";
import type { McpConfigTarget } from "../agent-capabilities/index.js";
import { parseYaml, readYamlEntry } from "../yaml/index.js";
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

  it.effect("serializes concurrent writes to the same config file (no dropped servers)", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-concurrent-"));
        try {
          const configPath = nodePath.join(workspaceRoot, "agent.json");
          writeFileSync(configPath, '{\n  "mcpServers": {}\n}\n');

          const serverNames = ["alpha", "beta", "gamma", "delta", "epsilon"];
          // Fire all writes concurrently against the same file. Without per-file
          // serialization each read-modify-write reads the same empty state and
          // clobbers the others (last-write-wins), dropping servers.
          yield* Effect.all(
            serverNames.map((serverName) =>
              writeAgentMcpConfig({
                workspaceRoot,
                serverName,
                serversKey: "mcpServers",
                target: { scope: "project", path: "agent.json", format: "json" },
                entry: { command: "npx", args: [`@acme/${serverName}`], enabled: true },
              }),
            ),
            { concurrency: "unbounded" },
          );

          const parsed: unknown = JSON.parse(readFileSync(configPath, "utf8"));
          const mcpServers =
            typeof parsed === "object" && parsed !== null && "mcpServers" in parsed
              ? parsed.mcpServers
              : undefined;
          const servers =
            typeof mcpServers === "object" && mcpServers !== null ? Object.keys(mcpServers) : [];
          expect(servers.sort()).toEqual([...serverNames].sort());
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
            activationField: {
              required: null,
              accepted: [null],
            },
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
            activationField: {
              required: null,
              accepted: [null],
            },
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

  it.effect("removes mixed-case underscore TOML markers without trimming user whitespace", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-toml-marker-"));
        try {
          const configPath = nodePath.join(workspaceRoot, "agent.toml");
          const original = 'model = "gpt-5"  \n\n';
          writeFileSync(configPath, original);
          const target: McpConfigTarget = {
            scope: "project",
            path: "agent.toml",
            format: "toml",
          };

          yield* writeAgentMcpConfig({
            workspaceRoot,
            serverName: "My_Server",
            serversKey: "mcp_servers",
            target,
            entry: { command: "npx" },
          });
          yield* removeAgentMcpConfig({
            workspaceRoot,
            serverName: "My_Server",
            serversKey: "mcp_servers",
            target,
            activationField: { required: null, accepted: [null] },
            disableOnly: false,
          });

          expect(readFileSync(configPath, "utf8")).toBe(original);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("writes multiple managed servers as strict TOML", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-toml-multi-"));
        try {
          const target = {
            scope: "project",
            path: "agent.toml",
            format: "toml",
          } as const;

          for (const serverName of ["alpha", "beta"]) {
            yield* writeAgentMcpConfig({
              workspaceRoot,
              serverName,
              serversKey: "mcp_servers",
              target,
              entry: {
                enabled: true,
                command: "npx",
                args: ["-y", `@acme/${serverName}`],
              },
            });
          }

          const raw = readFileSync(nodePath.join(workspaceRoot, target.path), "utf8");
          expect(parseToml(raw)).toMatchObject({
            mcp_servers: {
              alpha: { enabled: true, command: "npx" },
              beta: { enabled: true, command: "npx" },
            },
          });
          expect(raw).not.toMatch(/^\[mcp_servers\]$/m);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("disables only the named managed TOML server", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-toml-disable-"));
        try {
          const target = {
            scope: "project",
            path: "agent.toml",
            format: "toml",
          } as const;

          for (const serverName of ["alpha", "beta"]) {
            yield* writeAgentMcpConfig({
              workspaceRoot,
              serverName,
              serversKey: "mcp_servers",
              target,
              entry: { enabled: true, command: "npx" },
            });
          }

          yield* removeAgentMcpConfig({
            workspaceRoot,
            serverName: "beta",
            serversKey: "mcp_servers",
            target,
            activationField: {
              required: { name: "enabled", enabled: true, disabled: false },
              accepted: [{ name: "enabled", enabled: true, disabled: false }],
            },
            disableOnly: true,
          });

          expect(
            parseToml(readFileSync(nodePath.join(workspaceRoot, target.path), "utf8")),
          ).toMatchObject({
            mcp_servers: {
              alpha: { enabled: true },
              beta: { enabled: false },
            },
          });
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("writes Hermes-style YAML stdio entries without touching user content", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-yaml-"));
        try {
          const configPath = nodePath.join(workspaceRoot, "config.yaml");
          writeFileSync(
            configPath,
            [
              "# keep top",
              "model: hermes-4",
              "mcp_servers:",
              "  # user-owned",
              "  filesystem:",
              "    command: npx",
              "    timeout: 30",
              "",
            ].join("\n"),
          );

          const result = yield* writeAgentMcpConfig({
            workspaceRoot,
            serverName: "context",
            serversKey: "mcp_servers",
            target: { scope: "project", path: "config.yaml", format: "yaml" },
            entry: {
              "x-axm": { managed: true, source: "inline" },
              enabled: true,
              command: "npx",
              args: ["-y", "@acme/context-mcp"],
              env: { ACME_TOKEN: "secret" },
            },
          });

          const raw = readFileSync(configPath, "utf8");
          expect(raw).toContain("# keep top");
          expect(raw).toContain("# user-owned");
          expect(raw).toContain("timeout: 30");
          expect(readYamlEntry(raw, "mcp_servers", "filesystem")).toMatchObject({
            command: "npx",
            timeout: 30,
          });
          expect(readYamlEntry(raw, "mcp_servers", "context")).toMatchObject({
            "x-axm": { managed: true, source: "inline" },
            enabled: true,
            command: "npx",
            args: ["-y", "@acme/context-mcp"],
            env: { ACME_TOKEN: "secret" },
          });
          expect(result.targets).toEqual([{ path: "config.yaml", change: "updated" }]);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("writes Hermes-style YAML HTTP entries", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-yaml-http-"));
        try {
          const configPath = nodePath.join(workspaceRoot, "config.yaml");

          yield* writeAgentMcpConfig({
            workspaceRoot,
            serverName: "stripe",
            serversKey: "mcp_servers",
            target: { scope: "project", path: "config.yaml", format: "yaml" },
            entry: {
              "x-axm": { managed: true, source: "inline" },
              enabled: true,
              url: "https://mcp.stripe.com",
              headers: { Authorization: "Bearer ${STRIPE_TOKEN}" },
            },
          });

          expect(parseYaml(readFileSync(configPath, "utf8"))).toMatchObject({
            mcp_servers: {
              stripe: {
                "x-axm": { managed: true, source: "inline" },
                enabled: true,
                url: "https://mcp.stripe.com",
                headers: { Authorization: "Bearer ${STRIPE_TOKEN}" },
              },
            },
          });
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("removes and disables Hermes-style YAML entries", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-yaml-remove-"));
        try {
          const configPath = nodePath.join(workspaceRoot, "config.yaml");
          writeFileSync(
            configPath,
            [
              "mcp_servers:",
              "  filesystem:",
              "    command: npx",
              "  context:",
              "    x-axm:",
              "      managed: true",
              "      source: inline",
              "    enabled: true",
              "    command: npx",
              "",
            ].join("\n"),
          );

          const disableResult = yield* removeAgentMcpConfig({
            workspaceRoot,
            serverName: "context",
            serversKey: "mcp_servers",
            target: { scope: "project", path: "config.yaml", format: "yaml" },
            activationField: {
              required: { name: "enabled", enabled: true, disabled: false },
              accepted: [{ name: "enabled", enabled: true, disabled: false }],
            },
            disableOnly: true,
          });

          expect(
            readYamlEntry(readFileSync(configPath, "utf8"), "mcp_servers", "context"),
          ).toMatchObject({
            enabled: false,
            command: "npx",
          });
          expect(disableResult.targets).toEqual([{ path: "config.yaml", change: "updated" }]);

          const removeResult = yield* removeAgentMcpConfig({
            workspaceRoot,
            serverName: "context",
            serversKey: "mcp_servers",
            target: { scope: "project", path: "config.yaml", format: "yaml" },
            activationField: {
              required: { name: "enabled", enabled: true, disabled: false },
              accepted: [{ name: "enabled", enabled: true, disabled: false }],
            },
            disableOnly: false,
          });

          const raw = readFileSync(configPath, "utf8");
          expect(readYamlEntry(raw, "mcp_servers", "context")).toBeUndefined();
          expect(readYamlEntry(raw, "mcp_servers", "filesystem")).toMatchObject({
            command: "npx",
          });
          expect(removeResult.targets).toEqual([{ path: "config.yaml", change: "updated" }]);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("reports malformed JSONC as a validation failure without overwriting it", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-invalid-jsonc-"));
        try {
          const configPath = nodePath.join(workspaceRoot, "agent.jsonc");
          const invalidConfig = "{ invalid jsonc";
          writeFileSync(configPath, invalidConfig);

          const error = yield* writeAgentMcpConfig({
            workspaceRoot,
            serverName: "context",
            serversKey: "mcpServers",
            target: { scope: "project", path: "agent.jsonc", format: "jsonc" },
            entry: { command: "npx" },
          }).pipe(Effect.flip);

          expect(error.code).toBe("validation");
          expect(readFileSync(configPath, "utf8")).toBe(invalidConfig);
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
