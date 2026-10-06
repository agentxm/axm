import { CanonicalNativePathLive } from "../../locations/live.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as FileSystem from "effect/FileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { fc as FastCheck, it as fastCheckIt } from "@fast-check/vitest";
import * as Effect from "effect/Effect";
import { CONFIGURABLE_AGENT_IDS } from "@agentxm/extension-model/unstable/agent-capabilities";
import * as Layer from "effect/Layer";
import type { McpServerEntry } from "../../workspace-state/index.js";
import {
  buildAxmMcpMetadataFromSettingsSource,
  configuredMcpCapability,
  declaredMcpWriterTargets,
  pruneManagedMcpServersForAgents,
  readYamlEntry,
  removeMcpServerFromAgents,
  syncInlineMcpServerToAgents,
  type SyncInlineMcpServerArgs,
} from "../../agent-adapters/index.js";
import { NativeWriteAuthorityPermissive } from "../../agent-adapters/testing.js";
import { inspectDesiredMcpServer } from "./inspection.js";

const expectedInline = (...names: ReadonlyArray<string>) =>
  Object.fromEntries(
    names.map((name) => [name, [buildAxmMcpMetadataFromSettingsSource("inline", name)]]),
  );

/** One agent's outcome from the shared writer. */
const syncInlineMcpServerToAgent = (
  agentId: string,
  args: Omit<SyncInlineMcpServerArgs, "nativeInsertionEligible" | "nativeDirectoryInputs">,
) =>
  syncInlineMcpServerToAgents([agentId], {
    nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
    ...args,
    nativeInsertionEligible: false,
  }).pipe(
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
    nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
    workspaceRoot: args.workspaceRoot,
    scope: args.scope,
    agentIds: args.agentIds,
    node: { name: args.serverName, authority: "inline" },
    entry: args.entry,
    canonicalPaths: [],
  }).pipe(Effect.map(({ inspections }) => inspections));

const configurableMcpCases = CONFIGURABLE_AGENT_IDS.flatMap((agentId) => {
  const capability = configuredMcpCapability(agentId);
  if (capability === undefined) return [];
  const targets = declaredMcpWriterTargets(capability).map(({ target }) => target);
  const target =
    targets.find((candidate) => candidate.scope === "project") ??
    targets.find((candidate) => candidate.scope === "user");
  if (target === undefined) return [];
  return [{ agentId, scope: target.scope, transports: capability.native.transports }];
});

const inlineEntry = {
  kind: "inline",
  connection: {
    transport: "stdio",
    command: "npx",
    args: ["-y", "example-mcp-server"],
    env: { EXAMPLE_REGION: "us-east-1" },
  },
  enabled: true,
} satisfies McpServerEntry;
const inlineRemoteEntry = {
  kind: "inline",
  connection: { transport: "streamable-http", url: "https://mcp.example.com/api", headers: {} },
  enabled: true,
} satisfies McpServerEntry;

const entryForTransports = (transports: ReadonlyArray<string>): McpServerEntry =>
  transports.includes("stdio") ? inlineEntry : inlineRemoteEntry;

const withNode = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provide(
      Layer.mergeAll(NodeServices.layer, NativeWriteAuthorityPermissive, CanonicalNativePathLive),
    ),
  );

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
            pruneManagedMcpServersForAgents(["hermes"], {
              nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
              expectedManagedEntries: expectedInline("stale"),
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

  for (const testCase of configurableMcpCases)
    it.effect(
      `writes a config inspection reads as a match for ${testCase.agentId} in ${testCase.scope} scope`,
      () =>
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
    30_000,
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
          const outcome = yield* syncInlineMcpServerToAgent("gemini-cli", {
            workspaceRoot,
            serverName: "linear",
            scope: "project",
            entry: {
              kind: "inline",
              connection: {
                transport: "stdio",
                command: "npx",
                args: ["-y", "linear-mcp-server"],
                env: { LINEAR_API_KEY: { env: "LINEAR_API_KEY" } },
              },
              enabled: true,
            },
          });

          expect(outcome).toMatchObject({
            _tag: "success",
            targets: [{ path: `${workspaceRoot}/.gemini/settings.json`, change: "created" }],
          });
          const fs = yield* FileSystem.FileSystem;
          const config = yield* fs.readFileString(`${workspaceRoot}/.gemini/settings.json`);
          expect(config).toContain('"linear"');
          expect(config).toMatch(/"command":\s*"npx"/);
          expect(config).toMatch(/"args":\s*\[/);
          expect(config).toMatch(/"LINEAR_API_KEY":\s*"\$\{LINEAR_API_KEY\}"/);
          expect(config).not.toContain("real_literal_token");
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  const sharedAgents = ["claude-code", "codebuddy", "command-code", "github-copilot-cli", "qoder"];
  const sharedAgentCombinations = Array.from({ length: 2 ** sharedAgents.length - 1 }, (_, index) =>
    sharedAgents.filter((_, agentIndex) => ((index + 1) & (1 << agentIndex)) !== 0),
  );

  it.effect.each(sharedAgentCombinations.map((agentIds) => ({ agentIds })))(
    "writes a mutually readable project MCP file for $agentIds",
    ({ agentIds }) =>
      withNode(
        Effect.gen(function* () {
          const entry = {
            kind: "inline",
            connection: {
              transport: "stdio",
              command: "npx",
              args: ["-y", "linear-mcp-server"],
              env: { REGION: "us-east-1" },
            },
            enabled: true,
          } as const;

          const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-shared-sync-"));
          try {
            const outcomes = yield* syncInlineMcpServerToAgents(agentIds, {
              nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
              nativeInsertionEligible: false,
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
              expect(config).toMatch(/"type":\s*"stdio"/);
            }
          } finally {
            rmSync(workspaceRoot, { recursive: true, force: true });
          }
        }),
      ),
  );

  it.effect("produces the same Copilot-compatible shared file in either agent order", () =>
    withNode(
      Effect.gen(function* () {
        const entry = {
          kind: "inline",
          connection: {
            transport: "stdio",
            command: "npx",
            args: ["-y", "linear-mcp-server"],
            env: {},
          },
          enabled: true,
        } as const;
        const rendered: Array<string> = [];

        for (const agentIds of [
          ["claude-code", "github-copilot-cli"],
          ["github-copilot-cli", "claude-code"],
        ]) {
          const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-shared-order-"));
          try {
            yield* syncInlineMcpServerToAgents(agentIds, {
              nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
              nativeInsertionEligible: false,
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
        expect(rendered[0]).toMatch(/"type":\s*"stdio"/);
      }),
    ),
  );

  it.effect("syncs inline remote MCP servers to agent config with header references", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-sync-"));
        try {
          const outcome = yield* syncInlineMcpServerToAgent("gemini-cli", {
            workspaceRoot,
            serverName: "sentry",
            scope: "project",
            entry: {
              kind: "inline",
              connection: {
                transport: "sse",
                url: "https://mcp.sentry.dev/sse",
                headers: { Authorization: { template: ["Bearer ", { env: "SENTRY_TOKEN" }] } },
              },
              enabled: true,
            },
          });

          expect(outcome).toMatchObject({
            _tag: "success",
            targets: [{ path: `${workspaceRoot}/.gemini/settings.json`, change: "created" }],
          });
          const fs = yield* FileSystem.FileSystem;
          const config = yield* fs.readFileString(`${workspaceRoot}/.gemini/settings.json`);
          expect(config).toContain('"sentry"');
          expect(config).toMatch(/"url":\s*"https:\/\/mcp.sentry.dev\/sse"/);
          expect(config).toMatch(/"Authorization":\s*"Bearer \$\{SENTRY_TOKEN\}"/);
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
              kind: "inline",
              connection: {
                transport: "sse",
                url: "https://mcp.sentry.dev/sse",
                headers: { Authorization: { template: ["Bearer ", { env: "SENTRY_TOKEN" }] } },
              },
              enabled: true,
            },
          });

          expect(outcome).toMatchObject({
            _tag: "success",
            targets: [{ path: `${workspaceRoot}/.devin/mcp_config.json`, change: "created" }],
          });
          const fs = yield* FileSystem.FileSystem;
          const config = yield* fs.readFileString(`${workspaceRoot}/.devin/mcp_config.json`);
          expect(config).toContain('"mcpServers"');
          expect(config).toMatch(/"transport":\s*"sse"/);
          expect(config).toMatch(/"Authorization":\s*"Bearer \$\{SENTRY_TOKEN\}"/);
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
              kind: "inline",
              connection: {
                transport: "stdio",
                command: "npx",
                args: ["-y", "linear-mcp-server"],
                env: { REGION: "us-east-1" },
              },
              enabled: true,
            },
          });

          expect(outcome).toMatchObject({
            _tag: "success",
            targets: [{ path: `${workspaceRoot}/kilo.json`, change: "created" }],
          });
          const fs = yield* FileSystem.FileSystem;
          const config = yield* fs.readFileString(`${workspaceRoot}/kilo.json`);
          expect(config).toContain('"mcp"');
          expect(config).toMatch(/"type":\s*"local"/);
          expect(config).toMatch(/"command":\s*\[/);
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
              kind: "inline",
              connection: {
                transport: "stdio",
                command: "npx",
                args: ["-y", "linear-mcp-server"],
                env: { REGION: "us-east-1" },
              },
              enabled: true,
            },
          });

          expect(outcome).toMatchObject({
            _tag: "success",
            targets: [
              { path: `${workspaceRoot}/.codeartsdoer/codearts_cli.jsonc`, change: "created" },
            ],
          });
          const fs = yield* FileSystem.FileSystem;
          const config = yield* fs.readFileString(
            `${workspaceRoot}/.codeartsdoer/codearts_cli.jsonc`,
          );
          expect(config).toContain('"mcp"');
          expect(config).toMatch(/"type":\s*"local"/);
          expect(config).toMatch(/"command":\s*\[/);
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
              kind: "inline",
              connection: {
                transport: "sse",
                url: "https://mcp.sentry.dev/sse",
                headers: { Authorization: { template: ["Bearer ", { env: "SENTRY_TOKEN" }] } },
              },
              enabled: true,
            },
          });

          expect(outcome).toMatchObject({
            _tag: "success",
            targets: [{ path: `${workspaceRoot}/.kimi-code/mcp.json`, change: "created" }],
          });
          const fs = yield* FileSystem.FileSystem;
          const config = yield* fs.readFileString(`${workspaceRoot}/.kimi-code/mcp.json`);
          expect(config).toContain('"mcpServers"');
          expect(config).toMatch(/"transport":\s*"sse"/);
          expect(config).toMatch(/"bearerTokenEnvVar":\s*"SENTRY_TOKEN"/);
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
              kind: "inline",
              connection: {
                transport: "stdio",
                command: "npx",
                args: ["-y", "linear-mcp-server"],
                env: {},
              },
              enabled: true,
            },
          });
          yield* syncInlineMcpServerToAgent("claude-code", {
            workspaceRoot,
            serverName: "stale",
            scope: "project",
            entry: {
              kind: "inline",
              connection: { transport: "stdio", command: "stale-mcp", env: {} },
              enabled: true,
            },
          });
          yield* syncInlineMcpServerToAgent("claude-code", {
            workspaceRoot,
            serverName: "stale-two",
            scope: "project",
            entry: {
              kind: "inline",
              connection: { transport: "stdio", command: "stale-mcp", env: {} },
              enabled: true,
            },
          });

          const [outcome] = yield* pruneManagedMcpServersForAgents(["claude-code"], {
            nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
            expectedManagedEntries: expectedInline("stale", "stale-two"),
            workspaceRoot,
            scope: "project",
            declaredServerNames: new Set(["linear"]),
          });

          expect(outcome).toMatchObject({
            _tag: "success",
            targets: [
              {
                path: `${workspaceRoot}/.mcp.json`,
                change: "updated",
                nativeLocation: { address: { keys: ["mcpServers", "stale"] } },
              },
              {
                path: `${workspaceRoot}/.mcp.json`,
                change: "updated",
                nativeLocation: { address: { keys: ["mcpServers", "stale-two"] } },
              },
            ],
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
              const configPath = `${workspaceRoot}/.hermes/config.yaml`;
              const stdioOutcome = yield* syncInlineMcpServerToAgent("hermes", {
                workspaceRoot,
                serverName: "context",
                scope: "user",
                entry: {
                  kind: "inline",
                  connection: {
                    transport: "stdio",
                    command: "npx",
                    args: ["-y", "@acme/context-mcp"],
                    env: { REGION: "us-east-1" },
                  },
                  enabled: true,
                },
              });
              expect(stdioOutcome).toMatchObject({
                _tag: "success",
                targets: [{ path: configPath, change: "created" }],
              });

              const remoteOutcome = yield* syncInlineMcpServerToAgent("hermes", {
                workspaceRoot,
                serverName: "stripe",
                scope: "user",
                entry: {
                  kind: "inline",
                  connection: {
                    transport: "streamable-http",
                    url: "https://mcp.stripe.com",
                    headers: { "X-Region": "west" },
                  },
                  enabled: true,
                },
              });
              expect(remoteOutcome).toMatchObject({
                _tag: "success",
                targets: [{ path: configPath, change: "updated" }],
              });

              const fs = yield* FileSystem.FileSystem;
              let raw = yield* fs.readFileString(configPath);
              expect(readYamlEntry(raw, ["mcp_servers"], "context")).toMatchObject({
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
              expect(readYamlEntry(raw, ["mcp_servers"], "stripe")).toMatchObject({
                "x-axm": {
                  v: 1,
                  managed: true,
                  ext: "@workspace/mcps/stripe",
                  source: "inline",
                },
                enabled: true,
                url: "https://mcp.stripe.com",
              });
              expect(readYamlEntry(raw, ["mcp_servers"], "stripe")).toMatchObject({
                headers: { "X-Region": "west" },
              });

              const [disableOutcome] = yield* removeMcpServerFromAgents(["hermes"], {
                nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
                expectedManagedEntries: expectedInline("context", "stripe"),
                workspaceRoot,
                serverName: "context",
                scope: "user",
                disableOnly: true,
              });
              expect(disableOutcome).toMatchObject({
                _tag: "success",
                targets: [{ path: configPath, change: "updated" }],
              });
              raw = yield* fs.readFileString(configPath);
              expect(readYamlEntry(raw, ["mcp_servers"], "context")).toMatchObject({
                enabled: false,
              });

              const [removeOutcome] = yield* removeMcpServerFromAgents(["hermes"], {
                nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
                expectedManagedEntries: expectedInline("context", "stripe"),
                workspaceRoot,
                serverName: "stripe",
                scope: "user",
                disableOnly: false,
              });
              expect(removeOutcome).toMatchObject({
                _tag: "success",
                targets: [{ path: configPath, change: "updated" }],
              });
              raw = yield* fs.readFileString(configPath);
              expect(readYamlEntry(raw, ["mcp_servers"], "stripe")).toBeUndefined();

              yield* syncInlineMcpServerToAgent("hermes", {
                workspaceRoot,
                serverName: "stale",
                scope: "user",
                entry: {
                  kind: "inline",
                  connection: { transport: "stdio", command: "stale-mcp", env: {} },
                  enabled: true,
                },
              });
              const [pruneOutcome] = yield* pruneManagedMcpServersForAgents(["hermes"], {
                nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
                expectedManagedEntries: expectedInline("stale"),
                workspaceRoot,
                scope: "user",
                declaredServerNames: new Set(["context"]),
              });
              expect(pruneOutcome).toMatchObject({
                _tag: "success",
                targets: [{ path: configPath, change: "updated" }],
              });
              raw = yield* fs.readFileString(configPath);
              expect(readYamlEntry(raw, ["mcp_servers"], "context")).toMatchObject({
                enabled: false,
              });
              expect(readYamlEntry(raw, ["mcp_servers"], "stale")).toBeUndefined();
            }),
          );
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );
});
