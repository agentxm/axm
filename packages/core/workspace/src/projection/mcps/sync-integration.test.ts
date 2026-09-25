import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as FileSystem from "effect/FileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { fc as FastCheck, it as fastCheckIt } from "@fast-check/vitest";
import * as Effect from "effect/Effect";
import {
  CONFIGURABLE_AGENTS_BY_ID,
  CONFIGURABLE_AGENT_IDS,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import * as Layer from "effect/Layer";
import type { McpServerEntry } from "../../desired-state/index.js";
import {
  pruneManagedMcpServersForAgent,
  readYamlEntry,
  removeMcpServerFromManifest,
  syncInlineMcpServerToAgents,
  type SyncInlineMcpServerArgs,
} from "../agent-adapters/index.js";
import { NativeWriteAuthorityPermissive } from "../agent-adapters/testing.js";
import { inspectDesiredMcpServer } from "./inspection.js";

/** One agent's outcome from the shared writer. */
const syncInlineMcpServerToAgent = (agentId: string, args: SyncInlineMcpServerArgs) =>
  syncInlineMcpServerToAgents([agentId], args).pipe(
    Effect.flatMap((outcomes) =>
      outcomes[0] === undefined
        ? Effect.die(`no outcome for ${agentId}`)
        : Effect.succeed(outcomes[0]),
    ),
  );

/** The per-agent inspections of one inline connection. */
const inspectInlineAcrossAgents = (args: {
  readonly workspaceRoot: string;
  readonly scope: "project" | "user";
  readonly agentIds: ReadonlyArray<string>;
  readonly serverName: string;
  readonly entry: McpServerEntry;
}) =>
  inspectDesiredMcpServer({
    workspaceRoot: args.workspaceRoot,
    scope: args.scope,
    agentIds: args.agentIds,
    node: { name: args.serverName, authority: "inline" },
    entry: args.entry,
    canonicalPaths: [],
  }).pipe(Effect.map(({ inspections }) => inspections));

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

const withNode = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(Layer.merge(NodeServices.layer, NativeWriteAuthorityPermissive)));

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

          expect(error._tag).toBe("McpConfigInvalid");
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
                  const inspection = yield* inspectInlineAcrossAgents({
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

  fastCheckIt.prop(
    {
      testCase: FastCheck.constantFrom(...configurableMcpCases),
      serverName: FastCheck.tuple(
        FastCheck.constantFrom(..."abcdefghijklmnopqrstuvwxyz"),
        FastCheck.array(FastCheck.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-_"), {
          maxLength: 30,
        }),
      ).map(([first, rest]) => `${first}${rest.join("")}`),
    },
    { numRuns: 100, seed: 0x41584d },
  )(
    "preserves write-inspect agreement for arbitrary canonical server names",
    ({ testCase, serverName }) =>
      // eslint-disable-next-line no-restricted-syntax -- The fast-check Vitest adapter requires a Promise-returning property callback.
      Effect.runPromise(
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
                  const inspections = yield* inspectInlineAcrossAgents({
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
      ),
  );

  it.effect("refuses to write over a malformed native JSON config", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-sync-"));
        const configPath = `${workspaceRoot}/.mcp.json`;
        const invalidConfig = "{invalid json";
        try {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.writeFileString(configPath, invalidConfig);

          const error = yield* syncInlineMcpServerToAgent("claude-code", {
            workspaceRoot,
            serverName: "linear",
            scope: "project",
            entry: inlineEntry,
          }).pipe(Effect.flip);

          expect(error._tag).toBe("McpConfigInvalid");
          expect(yield* fs.readFileString(configPath)).toBe(invalidConfig);
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("refuses to write over a native JSON config whose servers are not an object", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-sync-"));
        const configPath = `${workspaceRoot}/.mcp.json`;
        const invalidConfig = '{\n  "mcpServers": []\n}\n';
        try {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.writeFileString(configPath, invalidConfig);

          const error = yield* syncInlineMcpServerToAgent("claude-code", {
            workspaceRoot,
            serverName: "linear",
            scope: "project",
            entry: inlineEntry,
          }).pipe(Effect.flip);

          expect(error._tag).toBe("McpConfigInvalid");
          expect(yield* fs.readFileString(configPath)).toBe(invalidConfig);
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

            const inspections = yield* inspectInlineAcrossAgents({
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
          yield* syncInlineMcpServerToAgent("claude-code", {
            workspaceRoot,
            serverName: "stale-two",
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
          expect(config).not.toContain('"stale-two"');
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
