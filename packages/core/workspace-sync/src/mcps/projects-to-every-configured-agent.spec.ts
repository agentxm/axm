import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { WorkspaceMutations } from "@agentxm/workspace-state";
import { defineSpecification } from "@agentxm/specification-metadata";

import { applySync, makeSyncFixture, type SyncFixture } from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/projects-to-every-configured-agent",
  title: "MCP servers reach every configured agent that can represent them",
  statement:
    "When an MCP server is configured and enabled, however it entered the workspace — added, authored inline, or adopted from one agent's own native configuration — reconciliation shall write it to the native configuration of every configured agent that can represent it, shall account for every configured agent and report one that cannot represent it as unsupported rather than omitting it, shall write no server that is configured as disabled, and shall remove it from every agent it reached once desired state disables or withdraws it.",
  class: "functional",
  role: "experience",
  goals: ["agent-interoperability", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "cli/mcps/import/adoption-reaches-every-configured-agent",
    "cli/mcps/inline-lifecycle-is-idempotent",
    "cli/mcps/inline-authority-is-operation-coherent",
    "cli/activation-follows-desired-state",
  ],
  supersedes: [],
  assumptions: [
    "Claude Code and Cursor keep distinct project-scope MCP configuration files, so two native files observe two agents.",
    "An unmanaged server declared in one agent's own configuration file is the only shape adoption records, so one such declaration stands for every adopted entry.",
    "Amp is catalogued without MCP configuration support, so it stands for any configured agent that cannot represent a server.",
  ],
  openQuestions: [],
});

// The immediate write and removal the `mcps add`, `mcps disable` and
// `mcps uninstall` routes perform themselves are stated by
// cli/activation-follows-desired-state (its inline MCP row) and the lifecycle
// uninstall specifications, which cite this identity for the every-agent
// consequence. What this file owns is the reconciliation that carries a
// recorded entry to every agent and withdraws it from every agent.

const CLAUDE_CODE_CONFIG = ".mcp.json";
const CURSOR_CONFIG = ".cursor/mcp.json";
const NATIVE_CONFIGS = [CLAUDE_CODE_CONFIG, CURSOR_CONFIG] as const;

/** Entries authored directly in `axm.json`, reaching agents only through sync. */
const authoredInlineEntries = {
  "local-tool": { command: "echo", args: ["local-tool"] },
  "remote-tool": { url: "https://example.test/mcp" },
  "muted-tool": { command: "echo muted", enabled: false },
} as const;

/** The entry shape `axm mcps add --command "node server.js"` records. */
const addedEntry = { demo: { command: "node", args: ["server.js"] } } as const;

const nativeHasServer = (workspace: SyncFixture, file: string, name: string): boolean => {
  if (!workspace.exists(file)) return false;
  const config: unknown = JSON.parse(workspace.readFile(file));
  if (typeof config !== "object" || config === null || !("mcpServers" in config)) return false;
  const servers = config.mcpServers;
  return typeof servers === "object" && servers !== null && name in servers;
};

const nativeServers = (workspace: SyncFixture, file: string): unknown =>
  JSON.parse(workspace.readFile(file));

describe("MCP servers project to every configured agent", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const workspaceWithAgents = (
    agents: ReadonlyArray<string>,
    mcpServers: Readonly<Record<string, unknown>> = {},
  ): SyncFixture => {
    const workspace = makeSyncFixture({
      settings: { owner: "@acme", agents, mcpServers },
    });
    cleanups.push(workspace.cleanup);
    return workspace;
  };

  const bothAgents = ["claude-code", "cursor"] as const;

  it.effect("sync writes an added server to every configured agent's native configuration", () => {
    const workspace = workspaceWithAgents(bothAgents, addedEntry);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();

          for (const file of NATIVE_CONFIGS) {
            expect(nativeServers(workspace, file), file).toMatchObject({
              mcpServers: {
                demo: expect.objectContaining({ command: "node", args: ["server.js"] }),
              },
            });
          }
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "an adopted server reaches every configured agent, not only the one that declared it",
    () => {
      // The server exists in one agent's own configuration file only —
      // the shape adoption leaves behind. Reconciliation is what has to carry
      // it to an agent that never declared it.
      const workspace = workspaceWithAgents(["claude-code"], {
        adopted: { command: "node", args: ["adopted.js"] },
      });
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();
            expect(nativeHasServer(workspace, CLAUDE_CODE_CONFIG, "adopted")).toBe(true);
            expect(nativeHasServer(workspace, CURSOR_CONFIG, "adopted")).toBe(false);

            workspace.writeSettings({
              owner: "@acme",
              agents: bothAgents,
              mcpServers: { adopted: { command: "node", args: ["adopted.js"] } },
            });
            yield* applySync();

            for (const file of NATIVE_CONFIGS) {
              expect(nativeServers(workspace, file), file).toMatchObject({
                mcpServers: {
                  adopted: expect.objectContaining({ command: "node", args: ["adopted.js"] }),
                },
              });
            }
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect(
    "sync writes entries authored in axm.json to every configured agent's native configuration",
    () => {
      const workspace = workspaceWithAgents(bothAgents, { ...authoredInlineEntries });
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();

            for (const file of NATIVE_CONFIGS) {
              expect(nativeServers(workspace, file), file).toMatchObject({
                mcpServers: {
                  "local-tool": expect.objectContaining({ command: "echo", args: ["local-tool"] }),
                  "remote-tool": expect.objectContaining({ url: "https://example.test/mcp" }),
                },
              });
            }
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("sync writes no entry that is configured as disabled", () => {
    const workspace = workspaceWithAgents(bothAgents, { ...authoredInlineEntries });
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();

          for (const file of NATIVE_CONFIGS) {
            expect(nativeHasServer(workspace, file, "muted-tool"), file).toBe(false);
          }
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "disabling in desired state removes the server from every agent it reached, and re-enabling restores it",
    () => {
      const workspace = workspaceWithAgents(bothAgents, addedEntry);
      const settingsWith = (entry: Readonly<Record<string, unknown>>): void => {
        workspace.writeSettings({ owner: "@acme", agents: bothAgents, mcpServers: entry });
      };
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();
            for (const file of NATIVE_CONFIGS) {
              expect(nativeHasServer(workspace, file, "demo"), file).toBe(true);
            }

            settingsWith({ demo: { command: "node", args: ["server.js"], enabled: false } });
            yield* applySync();
            for (const file of NATIVE_CONFIGS) {
              expect(nativeHasServer(workspace, file, "demo"), file).toBe(false);
            }

            settingsWith({ demo: { command: "node", args: ["server.js"], enabled: true } });
            yield* applySync();
            for (const file of NATIVE_CONFIGS) {
              expect(nativeHasServer(workspace, file, "demo"), file).toBe(true);
            }
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect(
    "withdrawing a server from desired state removes it from every agent it reached",
    () => {
      const workspace = workspaceWithAgents(bothAgents, addedEntry);
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();
            for (const file of NATIVE_CONFIGS) {
              expect(nativeHasServer(workspace, file, "demo"), file).toBe(true);
            }

            workspace.writeSettings({ owner: "@acme", agents: bothAgents, mcpServers: {} });
            yield* applySync();

            for (const file of NATIVE_CONFIGS) {
              expect(nativeHasServer(workspace, file, "demo"), file).toBe(false);
            }
            expect(JSON.stringify(workspace.readSettings())).not.toContain('"demo"');
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  const CONFIGURED_AGENTS = ["claude-code", "cursor", "amp"] as const;

  it.effect(
    "the workspace record names every configured agent, and the one that cannot represent the server as unsupported",
    () => {
      const workspace = workspaceWithAgents(CONFIGURED_AGENTS, addedEntry);
      return workspace
        .provide(
          Effect.gen(function* () {
            const ws = yield* WorkspaceMutations;
            yield* applySync();

            const inventory = yield* ws.records.getExtensionInventory("mcp-server", {});
            const item = inventory.items.find((entry) => entry.name === "demo");
            expect(item).toBeDefined();
            const outcomes = item?.agentOutcomes ?? [];

            // Nothing is omitted: every configured agent is accounted for.
            expect([...outcomes.map((outcome) => outcome.agentId)].sort()).toEqual(
              [...CONFIGURED_AGENTS].sort(),
            );
            // The agent that cannot represent the server says so, and says why.
            expect(outcomes.find((outcome) => outcome.agentId === "amp")).toMatchObject({
              outcome: "unsupported",
            });
            // Never the silent answer: "not applicable" would hide the agent.
            expect(outcomes.map((outcome) => outcome.outcome)).not.toContain("not-applicable");
            // The agents that can represent it are not mislabelled unsupported.
            for (const agentId of ["claude-code", "cursor"]) {
              expect(
                outcomes.find((outcome) => outcome.agentId === agentId)?.outcome,
                agentId,
              ).not.toBe("unsupported");
            }
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
