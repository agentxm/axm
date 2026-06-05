import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as FileSystem from "effect/FileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { ExitCode } from "../app-error/index.js";
import { handle } from "../test-helpers.js";
import {
  addMcpServerMixed,
  pruneManagedMcpServersForAgent,
  removeMcpServerMixed,
  runCliInvocation,
  syncInlineMcpServerToAgent,
} from "./mcp-sync.js";

const addArgs = (workspaceRoot: string) => ({
  workspaceRoot,
  serverName: "chrome-devtools-mcp",
  canonicalPath: `${workspaceRoot}/.axm/mcps/chrome-devtools-mcp`,
  owner: handle("@mcp"),
  resolvedVersion: "1.0.0",
});

const withNode = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

describe("mcp-sync helpers", () => {
  it.effect("captures output and redacts secrets from CLI output", () =>
    withNode(
      Effect.gen(function* () {
        const result = yield* runCliInvocation({
          command: process.execPath,
          args: [
            "-e",
            "process.stdout.write('token=abc123 key:secret123 bearer qwerty'); process.stderr.write('password=hidden')",
          ],
          timeoutMs: 2000,
          cwd: process.cwd(),
        });

        expect(result.exitCode).toBe(ExitCode.Success);
        expect(result.stdout).toContain("token=[REDACTED]");
        expect(result.stdout).toContain("key=[REDACTED]");
        expect(result.stdout).toContain("bearer [REDACTED]");
        expect(result.stderr).toContain("password=[REDACTED]");
      }),
    ),
  );

  it.effect("returns timeout outcome for long-running command", () =>
    withNode(
      Effect.gen(function* () {
        const result = yield* runCliInvocation({
          command: process.execPath,
          args: ["-e", "setTimeout(() => {}, 5000)"],
          timeoutMs: 50,
          cwd: process.cwd(),
        });

        expect(result.exitCode).toBe(124);
        expect(result.stderr).toContain("timed out");
      }),
    ),
  );

  it.effect("falls back to config when CLI is unavailable", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-sync-"));
        try {
          const outcome = yield* addMcpServerMixed(
            {
              configPath: "{workspaceRoot}/.agent/mcp.json",
              cliAdd: ["__missing_bin__", "mcp", "add", "{serverName}"],
              cliRemove: ["__missing_bin__", "mcp", "remove", "{serverName}"],
            },
            addArgs(workspaceRoot),
          );

          expect(outcome).toEqual({
            _tag: "fallback",
            fallbackFrom: "unsupported",
            reason:
              "__missing_bin__ CLI executable is unavailable on " +
              `${process.platform}; install __missing_bin__ and ensure it is on PATH`,
          });

          const fs = yield* FileSystem.FileSystem;
          const config = yield* fs.readFileString(`${workspaceRoot}/.agent/mcp.json`);
          expect(config).toContain('"chrome-devtools-mcp"');
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("preserves disabled outcome after config fallback", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-sync-"));
        try {
          const outcome = yield* addMcpServerMixed(
            {
              configPath: "{workspaceRoot}/.agent/mcp.json",
              cliAdd: [
                process.execPath,
                "-e",
                "process.stderr.write('login required'); process.exit(1)",
              ],
              cliRemove: [
                process.execPath,
                "-e",
                "process.stderr.write('login required'); process.exit(1)",
              ],
            },
            addArgs(workspaceRoot),
          );

          expect(outcome).toEqual({
            _tag: "fallback",
            fallbackFrom: "disabled",
            reason: "login required",
          });

          const fs = yield* FileSystem.FileSystem;
          const config = yield* fs.readFileString(`${workspaceRoot}/.agent/mcp.json`);
          expect(config).toContain('"chrome-devtools-mcp"');
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("maps idempotent add/remove CLI outputs to success", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-sync-"));
        try {
          const addOutcome = yield* addMcpServerMixed(
            {
              configPath: "{workspaceRoot}/.agent/mcp.json",
              cliAdd: [
                process.execPath,
                "-e",
                "process.stderr.write('already exists'); process.exit(1)",
              ],
              cliRemove: [
                process.execPath,
                "-e",
                "process.stderr.write('not configured'); process.exit(1)",
              ],
            },
            addArgs(workspaceRoot),
          );
          expect(addOutcome._tag).toBe("success");

          const removeOutcome = yield* removeMcpServerMixed(
            {
              configPath: "{workspaceRoot}/.agent/mcp.json",
              cliAdd: [
                process.execPath,
                "-e",
                "process.stderr.write('already exists'); process.exit(1)",
              ],
              cliRemove: [
                process.execPath,
                "-e",
                "process.stderr.write('not configured'); process.exit(1)",
              ],
            },
            {
              workspaceRoot,
              serverName: "chrome-devtools-mcp",
            },
          );
          expect(removeOutcome._tag).toBe("success");
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("fails on malformed existing JSON config without overwriting it", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-sync-"));
        const configPath = `${workspaceRoot}/.agent/mcp.json`;
        const invalidConfig = "{invalid json";

        try {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(nodePath.dirname(configPath), { recursive: true });
          yield* fs.writeFileString(configPath, invalidConfig);

          const error = yield* addMcpServerMixed(
            {
              configPath: "{workspaceRoot}/.agent/mcp.json",
              cliAdd: ["__missing_bin__", "mcp", "add", "{serverName}"],
              cliRemove: ["__missing_bin__", "mcp", "remove", "{serverName}"],
            },
            addArgs(workspaceRoot),
          ).pipe(Effect.flip);

          expect(error.code).toBe("validation");
          expect(yield* fs.readFileString(configPath)).toBe(invalidConfig);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("fails on invalid config shape without overwriting it", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-sync-"));
        const configPath = `${workspaceRoot}/.agent/mcp.json`;
        const invalidConfig = '{\n  "foo": {}\n}\n';

        try {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(nodePath.dirname(configPath), { recursive: true });
          yield* fs.writeFileString(configPath, invalidConfig);

          const error = yield* addMcpServerMixed(
            {
              configPath: "{workspaceRoot}/.agent/mcp.json",
              cliAdd: ["__missing_bin__", "mcp", "add", "{serverName}"],
              cliRemove: ["__missing_bin__", "mcp", "remove", "{serverName}"],
            },
            addArgs(workspaceRoot),
          ).pipe(Effect.flip);

          expect(error.code).toBe("validation");
          expect(yield* fs.readFileString(configPath)).toBe(invalidConfig);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("returns unsupported for adapters on unsupported platforms", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-sync-"));
        try {
          const outcome = yield* addMcpServerMixed(
            {
              configPath: "{workspaceRoot}/.agent/mcp.json",
              cliAdd: ["claude", "mcp", "add", "{serverName}"],
              cliRemove: ["claude", "mcp", "remove", "{serverName}"],
              supportedPlatforms: process.platform === "darwin" ? ["linux"] : ["darwin"],
            },
            addArgs(workspaceRoot),
          );

          expect(outcome._tag).toBe("unsupported");
          if (outcome._tag === "unsupported") {
            expect(outcome.reason).toContain("supported platforms");
            expect(outcome.reason).toContain(process.platform);
          }
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("syncs inline stdio MCP servers to agent config with env references", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-sync-"));
        try {
          const outcome = yield* syncInlineMcpServerToAgent("claude-code", {
            workspaceRoot,
            serverName: "linear",
            scope: "project",
            entry: {
              source: "inline",
              command: "npx",
              args: ["-y", "linear-mcp-server"],
              enabled: true,
              authored: false,
              env: { LINEAR_API_KEY: "${LINEAR_API_KEY}" },
            },
          });

          expect(outcome).toEqual({
            _tag: "success",
            targets: [{ path: ".mcp.json", change: "created" }],
          });
          const fs = yield* FileSystem.FileSystem;
          const config = yield* fs.readFileString(`${workspaceRoot}/.mcp.json`);
          expect(config).toContain('"linear"');
          expect(config).toContain('"command": "npx"');
          expect(config).toContain('"args": [');
          expect(config).toContain('"LINEAR_API_KEY": "${LINEAR_API_KEY}"');
          expect(config).not.toContain("real_literal_token");
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("syncs inline remote MCP servers to agent config with header references", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-sync-"));
        try {
          const outcome = yield* syncInlineMcpServerToAgent("claude-code", {
            workspaceRoot,
            serverName: "sentry",
            scope: "project",
            entry: {
              source: "inline",
              url: "https://mcp.sentry.dev/sse",
              headers: { Authorization: "Bearer ${SENTRY_TOKEN}" },
              enabled: true,
              authored: false,
              env: {},
            },
          });

          expect(outcome).toEqual({
            _tag: "success",
            targets: [{ path: ".mcp.json", change: "created" }],
          });
          const fs = yield* FileSystem.FileSystem;
          const config = yield* fs.readFileString(`${workspaceRoot}/.mcp.json`);
          expect(config).toContain('"sentry"');
          expect(config).toContain('"type": "sse"');
          expect(config).toContain('"Authorization": "Bearer ${SENTRY_TOKEN}"');
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("prunes stale AXM-managed MCP servers from agent config", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-sync-"));
        try {
          yield* syncInlineMcpServerToAgent("claude-code", {
            workspaceRoot,
            serverName: "linear",
            scope: "project",
            entry: {
              source: "inline",
              command: "npx",
              args: ["-y", "linear-mcp-server"],
              enabled: true,
              authored: false,
              env: { LINEAR_API_KEY: "${LINEAR_API_KEY}" },
            },
          });
          yield* syncInlineMcpServerToAgent("claude-code", {
            workspaceRoot,
            serverName: "stale",
            scope: "project",
            entry: {
              source: "inline",
              command: "stale-mcp",
              enabled: true,
              authored: false,
              env: {},
            },
          });

          const outcome = yield* pruneManagedMcpServersForAgent("claude-code", {
            workspaceRoot,
            scope: "project",
            declaredServerNames: new Set(["linear"]),
          });

          expect(outcome).toEqual({ _tag: "success" });
          const fs = yield* FileSystem.FileSystem;
          const config = yield* fs.readFileString(`${workspaceRoot}/.mcp.json`);
          expect(config).toContain('"linear"');
          expect(config).not.toContain('"stale"');
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );
});
