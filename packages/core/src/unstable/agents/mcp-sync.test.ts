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
  removeMcpServerFromManifest,
  removeMcpServerMixed,
  runCliInvocation,
  syncInlineMcpServerToAgent,
} from "./mcp-sync.js";
import { readYamlEntry } from "../yaml/index.js";

const addArgs = (workspaceRoot: string) => ({
  workspaceRoot,
  serverName: "chrome-devtools-mcp",
  canonicalPath: `${workspaceRoot}/.axm/mcps/chrome-devtools-mcp`,
  owner: handle("@mcp"),
  resolvedVersion: "1.0.0",
});

const withNode = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

const withHome = <A, E, R>(home: string, effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = process.env["HOME"];
      process.env["HOME"] = home;
      return previous;
    }),
    () => effect,
    (previous) =>
      Effect.sync(() => {
        if (previous === undefined) {
          delete process.env["HOME"];
        } else {
          process.env["HOME"] = previous;
        }
      }),
  );

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

  // `it.live`: the invocation timeout runs on Effect's clock, which the
  // TestClock provided by `it.effect` never advances.
  it.live("returns timeout outcome for long-running command", () =>
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

  it.effect("uses Devin's catalog MCP writer dialect", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-sync-devin-"));
        try {
          const outcome = yield* syncInlineMcpServerToAgent("devin", {
            workspaceRoot,
            serverName: "sentry",
            scope: "project",
            entry: {
              source: "inline",
              url: "https://mcp.sentry.dev/sse",
              headers: { Authorization: "Bearer ${SENTRY_TOKEN}" },
              enabled: true,
              env: {},
            },
          });

          expect(outcome).toEqual({
            _tag: "success",
            targets: [{ path: ".devin/config.json", change: "created" }],
          });
          const fs = yield* FileSystem.FileSystem;
          const config = yield* fs.readFileString(`${workspaceRoot}/.devin/config.json`);
          expect(config).toContain('"mcpServers"');
          expect(config).toContain('"transport": "sse"');
          expect(config).toContain('"Authorization": "Bearer ${SENTRY_TOKEN}"');
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("uses Kilo Code's catalog MCP writer dialect", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-sync-kilo-"));
        try {
          const outcome = yield* syncInlineMcpServerToAgent("kilo", {
            workspaceRoot,
            serverName: "linear",
            scope: "project",
            entry: {
              source: "inline",
              command: "npx",
              args: ["-y", "linear-mcp-server"],
              enabled: true,
              env: { LINEAR_API_KEY: "${LINEAR_API_KEY}" },
            },
          });

          expect(outcome).toEqual({
            _tag: "success",
            targets: [{ path: "kilo.jsonc", change: "created" }],
          });
          const fs = yield* FileSystem.FileSystem;
          const config = yield* fs.readFileString(`${workspaceRoot}/kilo.jsonc`);
          expect(config).toContain('"mcp"');
          expect(config).toContain('"type": "local"');
          expect(config).toContain('"command": [');
          expect(config).toContain('"environment"');
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
              env: {},
            },
          });

          const outcome = yield* pruneManagedMcpServersForAgent("claude-code", {
            workspaceRoot,
            scope: "project",
            declaredServerNames: new Set(["linear"]),
          });

          expect(outcome).toEqual({
            _tag: "success",
            targets: [{ path: `${workspaceRoot}/.mcp.json`, change: "updated" }],
          });
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

  it.effect("syncs, disables, removes, and prunes Hermes YAML MCP entries", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-sync-hermes-"));
        try {
          yield* withHome(
            workspaceRoot,
            Effect.gen(function* () {
              const stdioOutcome = yield* syncInlineMcpServerToAgent("hermes", {
                workspaceRoot,
                serverName: "context",
                scope: "user",
                entry: {
                  source: "inline",
                  command: "npx",
                  args: ["-y", "@acme/context-mcp"],
                  enabled: true,
                  env: { ACME_TOKEN: "${ACME_TOKEN}" },
                },
              });
              expect(stdioOutcome).toEqual({
                _tag: "success",
                targets: [{ path: "~/.hermes/config.yaml", change: "created" }],
                warnings: ["env.ACME_TOKEN: does not expand environment reference ${ACME_TOKEN}"],
              });

              const remoteOutcome = yield* syncInlineMcpServerToAgent("hermes", {
                workspaceRoot,
                serverName: "stripe",
                scope: "user",
                entry: {
                  source: "inline",
                  url: "https://mcp.stripe.com",
                  headers: { Authorization: "Bearer ${STRIPE_TOKEN}" },
                  enabled: true,
                  env: {},
                },
              });
              expect(remoteOutcome).toEqual({
                _tag: "success",
                targets: [{ path: "~/.hermes/config.yaml", change: "updated" }],
              });

              const fs = yield* FileSystem.FileSystem;
              const configPath = `${workspaceRoot}/.hermes/config.yaml`;
              let raw = yield* fs.readFileString(configPath);
              expect(readYamlEntry(raw, "mcp_servers", "context")).toMatchObject({
                "x-axm": { managed: true, source: "inline" },
                enabled: true,
                command: "npx",
                args: ["-y", "@acme/context-mcp"],
                env: { ACME_TOKEN: "${ACME_TOKEN}" },
              });
              expect(readYamlEntry(raw, "mcp_servers", "stripe")).toMatchObject({
                "x-axm": { managed: true, source: "inline" },
                enabled: true,
                url: "https://mcp.stripe.com",
                headers: { Authorization: "Bearer ${STRIPE_TOKEN}" },
              });

              const disableOutcome = yield* removeMcpServerFromManifest("hermes", {
                workspaceRoot,
                serverName: "context",
                scope: "user",
                disableOnly: true,
              });
              expect(disableOutcome).toEqual({
                _tag: "success",
                targets: [{ path: "~/.hermes/config.yaml", change: "updated" }],
              });
              raw = yield* fs.readFileString(configPath);
              expect(readYamlEntry(raw, "mcp_servers", "context")).toMatchObject({
                enabled: false,
              });

              const removeOutcome = yield* removeMcpServerFromManifest("hermes", {
                workspaceRoot,
                serverName: "stripe",
                scope: "user",
                disableOnly: false,
              });
              expect(removeOutcome).toEqual({
                _tag: "success",
                targets: [{ path: "~/.hermes/config.yaml", change: "updated" }],
              });
              raw = yield* fs.readFileString(configPath);
              expect(readYamlEntry(raw, "mcp_servers", "stripe")).toBeUndefined();

              yield* syncInlineMcpServerToAgent("hermes", {
                workspaceRoot,
                serverName: "stale",
                scope: "user",
                entry: {
                  source: "inline",
                  command: "stale-mcp",
                  enabled: true,
                  env: {},
                },
              });
              const pruneOutcome = yield* pruneManagedMcpServersForAgent("hermes", {
                workspaceRoot,
                scope: "user",
                declaredServerNames: new Set(["context"]),
              });
              expect(pruneOutcome).toEqual({
                _tag: "success",
                targets: [{ path: configPath, change: "updated" }],
              });
              raw = yield* fs.readFileString(configPath);
              expect(readYamlEntry(raw, "mcp_servers", "context")).toMatchObject({
                enabled: false,
              });
              expect(readYamlEntry(raw, "mcp_servers", "stale")).toBeUndefined();
            }),
          );
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );
});
