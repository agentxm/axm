import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as FileSystem from "effect/FileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FastCheck from "effect/testing/FastCheck";
import {
  CONFIGURABLE_AGENTS_BY_ID,
  CONFIGURABLE_AGENT_IDS,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import { ExitCode } from "../app-error/index.js";
import type { McpServerEntry } from "@agentxm/workspace-state";
import { handle } from "../test-helpers.js";
import {
  addMcpServerMixed,
  pruneManagedMcpServersForAgent,
  removeMcpServerFromManifest,
  removeMcpServerMixed,
  runCliInvocation,
  syncInlineMcpServerToAgent,
  syncInlineMcpServerToAgents,
} from "./mcp-sync.js";
import { inspectMcpServerAcrossAgents } from "../mcps/inspection.js";
import { readYamlEntry } from "../yaml/index.js";

const configurableMcpCases = CONFIGURABLE_AGENT_IDS.flatMap((agentId) => {
  const capability = CONFIGURABLE_AGENTS_BY_ID[agentId].capabilities["mcp-server"];
  if (capability.axm.writer === null || !("transports" in capability.native)) return [];
  const target =
    capability.axm.writer.config.targets.find((candidate) => candidate.scope === "project") ??
    capability.axm.writer.config.targets.find((candidate) => candidate.scope === "user");
  if (target === undefined) return [];
  return [{ agentId, scope: target.scope, transports: capability.native.transports }];
});

const inlineEntry = {
  source: "inline",
  command: "npx",
  args: ["-y", "example-mcp-server"],
  enabled: true,
  env: { EXAMPLE_REGION: "us-east-1" },
} satisfies McpServerEntry;
const inlineRemoteEntry = {
  source: "inline",
  url: "https://mcp.example.com/api",
  enabled: true,
  headers: {},
  env: {},
} satisfies McpServerEntry;

const entryForTransports = (transports: ReadonlyArray<string>): McpServerEntry =>
  transports.includes("stdio") ? inlineEntry : inlineRemoteEntry;

const addArgs = (workspaceRoot: string) => ({
  workspaceRoot,
  serverName: "chrome-devtools-mcp",
  canonicalPath: `${workspaceRoot}/agent_extensions/agentxm/@mcp/mcps/chrome-devtools-mcp`,
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
  it.effect("reports malformed Hermes YAML while pruning managed entries", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-prune-invalid-yaml-"));
        try {
          const fs = yield* FileSystem.FileSystem;
          const configPath = nodePath.join(workspaceRoot, ".hermes", "config.yaml");
          yield* fs.makeDirectory(nodePath.dirname(configPath), { recursive: true });
          yield* fs.writeFileString(configPath, "mcp_servers:\n  context: [\n");

          const error = yield* withHome(
            workspaceRoot,
            pruneManagedMcpServersForAgent("hermes", {
              workspaceRoot,
              scope: "user",
              declaredServerNames: new Set(),
            }),
          ).pipe(Effect.flip);

          expect(error.code).toBe("validation");
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect(
    "writes a config that inspection reads as a match for every configurable MCP agent",
    () =>
      withNode(
        Effect.gen(function* () {
          expect(configurableMcpCases.length).toBeGreaterThan(0);
          for (const testCase of configurableMcpCases) {
            const workspaceRoot = mkdtempSync(
              nodePath.join(tmpdir(), `axm-mcp-${testCase.agentId}-`),
            );
            try {
              const entry = entryForTransports(testCase.transports);
              yield* withHome(
                workspaceRoot,
                Effect.gen(function* () {
                  const outcome = yield* syncInlineMcpServerToAgent(testCase.agentId, {
                    workspaceRoot,
                    serverName: "example-server",
                    scope: testCase.scope,
                    entry,
                  });
                  expect(outcome._tag, testCase.agentId).toBe("success");
                  const inspection = yield* inspectMcpServerAcrossAgents({
                    workspaceRoot,
                    scope: testCase.scope,
                    agentIds: [testCase.agentId],
                    serverName: "example-server",
                    entry,
                  });
                  expect(inspection[0]?.status, testCase.agentId).toBe("match");
                }),
              );
            } finally {
              rmSync(workspaceRoot, { recursive: true, force: true });
            }
          }
        }),
      ),
  );

  it.effect.prop(
    "preserves write-inspect agreement for arbitrary canonical server names",
    {
      testCase: FastCheck.constantFrom(...configurableMcpCases),
      serverName: FastCheck.tuple(
        FastCheck.constantFrom(..."abcdefghijklmnopqrstuvwxyz"),
        FastCheck.array(FastCheck.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-_"), {
          maxLength: 30,
        }),
      ).map(([first, rest]) => `${first}${rest.join("")}`),
    },
    ({ testCase, serverName }) =>
      withNode(
        Effect.gen(function* () {
          const workspaceRoot = mkdtempSync(
            nodePath.join(tmpdir(), `axm-mcp-${testCase.agentId}-`),
          );
          try {
            const entry = entryForTransports(testCase.transports);
            yield* withHome(
              workspaceRoot,
              Effect.gen(function* () {
                const outcome = yield* syncInlineMcpServerToAgent(testCase.agentId, {
                  workspaceRoot,
                  serverName,
                  scope: testCase.scope,
                  entry,
                });
                expect(outcome._tag).toBe("success");
                const inspections = yield* inspectMcpServerAcrossAgents({
                  workspaceRoot,
                  scope: testCase.scope,
                  agentIds: [testCase.agentId],
                  serverName,
                  entry,
                });
                expect(inspections[0]?.status).toBe("match");
              }),
            );
          } finally {
            rmSync(workspaceRoot, { recursive: true, force: true });
          }
        }),
      ),
    { fastCheck: { numRuns: 100, seed: 0x41584d } },
  );

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

  it.effect("writes a mutually readable project MCP file for every shared-agent combination", () =>
    withNode(
      Effect.gen(function* () {
        const sharedAgents = [
          "claude-code",
          "codebuddy",
          "command-code",
          "github-copilot-cli",
          "qoder",
        ];
        const combinations = Array.from({ length: 2 ** sharedAgents.length - 1 }, (_, index) =>
          sharedAgents.filter((_, agentIndex) => ((index + 1) & (1 << agentIndex)) !== 0),
        );
        const entry = {
          source: "inline",
          command: "npx",
          args: ["-y", "linear-mcp-server"],
          enabled: true,
          env: { REGION: "us-east-1" },
        } as const;

        for (const agentIds of combinations) {
          const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-shared-sync-"));
          try {
            const outcomes = yield* syncInlineMcpServerToAgents(agentIds, {
              workspaceRoot,
              serverName: "linear",
              scope: "project",
              entry,
            });
            expect(
              outcomes.every((outcome) => outcome._tag === "success"),
              agentIds.join(", "),
            ).toBe(true);

            const inspections = yield* inspectMcpServerAcrossAgents({
              workspaceRoot,
              scope: "project",
              agentIds,
              serverName: "linear",
              entry,
            });
            expect(
              inspections.every((inspection) => inspection.status === "match"),
              agentIds.join(", "),
            ).toBe(true);

            const fs = yield* FileSystem.FileSystem;
            const config = yield* fs.readFileString(`${workspaceRoot}/.mcp.json`);
            expect(config).not.toContain('"enabled"');
            if (agentIds.includes("github-copilot-cli")) {
              expect(config).toContain('"type": "stdio"');
            }
          } finally {
            rmSync(workspaceRoot, { recursive: true, force: true });
          }
        }
      }),
    ),
  );

  it.effect("produces the same Copilot-compatible shared file in either agent order", () =>
    withNode(
      Effect.gen(function* () {
        const entry = {
          source: "inline",
          command: "npx",
          args: ["-y", "linear-mcp-server"],
          enabled: true,
          env: {},
        } as const;
        const rendered: Array<string> = [];

        for (const agentIds of [
          ["claude-code", "github-copilot-cli"],
          ["github-copilot-cli", "claude-code"],
        ]) {
          const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-shared-order-"));
          try {
            yield* syncInlineMcpServerToAgents(agentIds, {
              workspaceRoot,
              serverName: "linear",
              scope: "project",
              entry,
            });
            const fs = yield* FileSystem.FileSystem;
            rendered.push(yield* fs.readFileString(`${workspaceRoot}/.mcp.json`));
          } finally {
            rmSync(workspaceRoot, { recursive: true, force: true });
          }
        }

        expect(rendered[0]).toBe(rendered[1]);
        expect(rendered[0]).toContain('"type": "stdio"');
      }),
    ),
  );

  it.effect("applies an agent subset and removes only stale AXM-managed projections", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-targets-"));
        try {
          const broadEntry = {
            source: "inline",
            command: "npx",
            args: ["-y", "example-mcp"],
            enabled: true,
            env: {},
          } satisfies McpServerEntry;
          const targetedEntry = {
            ...broadEntry,
            agents: ["claude-code"],
          } satisfies McpServerEntry;

          yield* syncInlineMcpServerToAgents(["claude-code", "kilo"], {
            workspaceRoot,
            serverName: "example",
            scope: "project",
            entry: broadEntry,
          });
          const outcomes = yield* syncInlineMcpServerToAgents(["claude-code", "kilo"], {
            workspaceRoot,
            serverName: "example",
            scope: "project",
            entry: targetedEntry,
          });
          expect(outcomes.every((outcome) => outcome._tag === "success")).toBe(true);

          const inspections = yield* inspectMcpServerAcrossAgents({
            workspaceRoot,
            scope: "project",
            agentIds: ["claude-code", "kilo"],
            serverName: "example",
            entry: targetedEntry,
          });
          expect(inspections.map(({ status }) => status)).toEqual(["match", "not-applicable"]);
          const fs = yield* FileSystem.FileSystem;
          expect(yield* fs.readFileString(`${workspaceRoot}/kilo.json`)).not.toContain('"example"');
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("blocks an agent subset that cannot be represented by a shared native target", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-shared-targets-"));
        try {
          const error = yield* syncInlineMcpServerToAgents(["claude-code", "github-copilot-cli"], {
            workspaceRoot,
            serverName: "example",
            scope: "project",
            entry: {
              source: "inline",
              command: "npx",
              enabled: true,
              env: {},
              agents: ["claude-code"],
            },
          }).pipe(Effect.flip);

          expect(error.code).toBe("conflict");
          expect(error.detail).toContain("shared native target");
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("preserves an unmanaged collision while removing an agent target", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-unmanaged-target-"));
        try {
          const fs = yield* FileSystem.FileSystem;
          const configPath = `${workspaceRoot}/kilo.json`;
          const original = '{\n  "mcp": { "example": { "command": ["other"] } }\n}\n';
          yield* fs.writeFileString(configPath, original);
          const error = yield* syncInlineMcpServerToAgents(["claude-code", "kilo"], {
            workspaceRoot,
            serverName: "example",
            scope: "project",
            entry: {
              source: "inline",
              command: "npx",
              enabled: true,
              env: {},
              agents: ["claude-code"],
            },
          }).pipe(Effect.flip);

          expect(error.code).toBe("conflict");
          expect(yield* fs.readFileString(configPath)).toBe(original);
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
            targets: [{ path: ".devin/mcp_config.json", change: "created" }],
          });
          const fs = yield* FileSystem.FileSystem;
          const config = yield* fs.readFileString(`${workspaceRoot}/.devin/mcp_config.json`);
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
              env: { REGION: "us-east-1" },
            },
          });

          expect(outcome).toEqual({
            _tag: "success",
            targets: [{ path: "kilo.json", change: "created" }],
          });
          const fs = yield* FileSystem.FileSystem;
          const config = yield* fs.readFileString(`${workspaceRoot}/kilo.json`);
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

  it.effect("uses CodeArts Agent's catalog MCP writer dialect", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-sync-codearts-"));
        try {
          const outcome = yield* syncInlineMcpServerToAgent("codearts-agent", {
            workspaceRoot,
            serverName: "linear",
            scope: "project",
            entry: {
              source: "inline",
              command: "npx",
              args: ["-y", "linear-mcp-server"],
              enabled: true,
              env: { REGION: "us-east-1" },
            },
          });

          expect(outcome).toEqual({
            _tag: "success",
            targets: [{ path: ".codeartsdoer/codearts_cli.jsonc", change: "created" }],
          });
          const fs = yield* FileSystem.FileSystem;
          const config = yield* fs.readFileString(
            `${workspaceRoot}/.codeartsdoer/codearts_cli.jsonc`,
          );
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

  it.effect("uses Kimi Code's current catalog MCP writer dialect", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-sync-kimi-"));
        try {
          const outcome = yield* syncInlineMcpServerToAgent("kimi-cli", {
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
            targets: [{ path: ".kimi-code/mcp.json", change: "created" }],
          });
          const fs = yield* FileSystem.FileSystem;
          const config = yield* fs.readFileString(`${workspaceRoot}/.kimi-code/mcp.json`);
          expect(config).toContain('"mcpServers"');
          expect(config).toContain('"transport": "sse"');
          expect(config).toContain('"bearerTokenEnvVar": "SENTRY_TOKEN"');
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
                  env: { REGION: "us-east-1" },
                },
              });
              expect(stdioOutcome).toEqual({
                _tag: "success",
                targets: [{ path: "~/.hermes/config.yaml", change: "created" }],
              });

              const remoteOutcome = yield* syncInlineMcpServerToAgent("hermes", {
                workspaceRoot,
                serverName: "stripe",
                scope: "user",
                entry: {
                  source: "inline",
                  url: "https://mcp.stripe.com",
                  headers: { Accept: "application/json" },
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
                "x-axm": {
                  v: 1,
                  managed: true,
                  ext: "@workspace/mcps/context",
                  source: "inline",
                },
                enabled: true,
                command: "npx",
                args: ["-y", "@acme/context-mcp"],
                env: { REGION: "us-east-1" },
              });
              expect(readYamlEntry(raw, "mcp_servers", "stripe")).toMatchObject({
                "x-axm": {
                  v: 1,
                  managed: true,
                  ext: "@workspace/mcps/stripe",
                  source: "inline",
                },
                enabled: true,
                url: "https://mcp.stripe.com",
              });
              expect(readYamlEntry(raw, "mcp_servers", "stripe")).toMatchObject({
                headers: { Accept: "application/json" },
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
