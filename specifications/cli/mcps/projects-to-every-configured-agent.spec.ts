import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  handleDisableMcpServer,
  handleEnableMcpServer,
  handleListMcpServers,
  handleMcpsAdd,
  handleSync,
  handleUninstallMcpServer,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/projects-to-every-configured-agent",
  title: "MCP servers reach every configured agent that can represent them",
  statement:
    "When an MCP server is configured and enabled, or re-enabled, AXM shall write it to the native configuration of every configured agent that can represent it, shall report each agent that cannot as unsupported rather than omitting it, shall write no server that is configured as disabled, and disabling or uninstalling it shall remove it from every agent it reached.",
  class: "functional",
  role: "experience",
  goals: ["agent-interoperability", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "cli/mcps/inline-lifecycle-is-idempotent",
    "cli/mcps/inline-authority-is-operation-coherent",
    "cli/activation-follows-desired-state",
    "packages/extension-workspace/src/mcps/shared-target-catalog.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [
    "Claude Code and Cursor keep distinct project-scope MCP configuration files, so two native files observe two agents.",
    "Amp is catalogued without MCP configuration support, so it stands for any configured agent that cannot represent a server.",
  ],
  openQuestions: [],
});

const CLAUDE_CODE_CONFIG = ".mcp.json";
const CURSOR_CONFIG = ".cursor/mcp.json";
const NATIVE_CONFIGS = [CLAUDE_CODE_CONFIG, CURSOR_CONFIG] as const;

/** Inline entries authored directly in `axm.json`, reaching agents only through sync. */
const authoredInlineEntries = {
  "local-tool": { command: "echo", args: ["local-tool"] },
  "remote-tool": { url: "https://example.test/mcp" },
  "muted-tool": { command: "echo muted", enabled: false },
} as const;

const InventoryOutcomesSchema = Schema.Struct({
  items: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      agentOutcomes: Schema.Array(
        Schema.Struct({ agentId: Schema.String, outcome: Schema.String }),
      ),
    }),
  ),
});
const decodeInventoryOutcomes = Schema.decodeUnknownSync(InventoryOutcomesSchema);

type SpecWorkspace = ReturnType<typeof makeSpecWorkspace>;

const nativeHasServer = (workspace: SpecWorkspace, file: string, name: string): boolean => {
  const absolute = path.join(workspace.root, file);
  if (!fs.existsSync(absolute)) {
    return false;
  }
  const config: unknown = JSON.parse(fs.readFileSync(absolute, "utf8"));
  if (typeof config !== "object" || config === null || !("mcpServers" in config)) {
    return false;
  }
  const servers = config.mcpServers;
  return typeof servers === "object" && servers !== null && name in servers;
};

const nativeServer = (workspace: SpecWorkspace, file: string): unknown =>
  JSON.parse(workspace.readFile(file));

const listedOutcomes = (workspace: SpecWorkspace, name: string) => {
  workspace.rendererState.results.length = 0;
  return handleListMcpServers().pipe(
    Effect.provide(workspace.layer),
    Effect.map(() => {
      const inventory = decodeInventoryOutcomes(workspace.rendererState.results.at(-1)?.data);
      const item = inventory.items.find((entry) => entry.name === name);
      expect(item).toBeDefined();
      return item?.agentOutcomes ?? [];
    }),
  );
};

describe("MCP servers project to every configured agent", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const workspaceWithAgents = (agents: ReadonlyArray<string>, mcps?: Record<string, unknown>) => {
    const workspace = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      settings: { agents, ...(mcps === undefined ? {} : { mcps }) },
    });
    cleanups.push(workspace.cleanup);
    return workspace;
  };

  const addDemo = (workspace: SpecWorkspace) =>
    handleMcpsAdd({
      name: "demo",
      command: Option.some("node server.js"),
      url: Option.none(),
      env: [],
      header: [],
      force: false,
      preview: false,
    }).pipe(Effect.provide(workspace.layer));

  it.effect("adding a server writes it to every configured agent's native configuration", () =>
    Effect.gen(function* () {
      const workspace = workspaceWithAgents(["claude-code", "cursor"]);

      yield* addDemo(workspace);

      for (const file of NATIVE_CONFIGS) {
        expect(nativeServer(workspace, file), file).toMatchObject({
          mcpServers: { demo: expect.objectContaining({ command: "node", args: ["server.js"] }) },
        });
      }
    }),
  );

  it.effect(
    "sync writes an entry authored in axm.json to every configured agent's native configuration",
    () =>
      Effect.gen(function* () {
        const workspace = workspaceWithAgents(["claude-code", "cursor"], {
          ...authoredInlineEntries,
        });

        yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

        for (const file of NATIVE_CONFIGS) {
          expect(nativeServer(workspace, file), file).toMatchObject({
            mcpServers: {
              "local-tool": expect.objectContaining({ command: "echo", args: ["local-tool"] }),
              "remote-tool": expect.objectContaining({ url: "https://example.test/mcp" }),
            },
          });
        }
      }),
  );

  it.effect("sync writes no entry that is configured as disabled", () =>
    Effect.gen(function* () {
      const workspace = workspaceWithAgents(["claude-code", "cursor"], {
        ...authoredInlineEntries,
      });

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      for (const file of NATIVE_CONFIGS) {
        expect(nativeHasServer(workspace, file, "muted-tool"), file).toBe(false);
      }
    }),
  );

  it.effect(
    "disabling removes the server from every agent it reached and enabling restores it",
    () =>
      Effect.gen(function* () {
        const workspace = workspaceWithAgents(["claude-code", "cursor"]);
        yield* addDemo(workspace);

        yield* handleDisableMcpServer({ name: "demo", preview: false }).pipe(
          Effect.provide(workspace.layer),
        );
        expect(nativeHasServer(workspace, CLAUDE_CODE_CONFIG, "demo")).toBe(false);
        expect(nativeHasServer(workspace, CURSOR_CONFIG, "demo")).toBe(false);

        yield* handleEnableMcpServer({ name: "demo", preview: false }).pipe(
          Effect.provide(workspace.layer),
        );
        expect(nativeHasServer(workspace, CLAUDE_CODE_CONFIG, "demo")).toBe(true);
        expect(nativeHasServer(workspace, CURSOR_CONFIG, "demo")).toBe(true);
      }),
  );

  it.effect("uninstalling removes the server from every agent it reached", () =>
    Effect.gen(function* () {
      const workspace = workspaceWithAgents(["claude-code", "cursor"]);
      yield* addDemo(workspace);

      yield* handleUninstallMcpServer({ serverName: "demo" }, { preview: false }).pipe(
        Effect.provide(workspace.layer),
      );

      expect(nativeHasServer(workspace, CLAUDE_CODE_CONFIG, "demo")).toBe(false);
      expect(nativeHasServer(workspace, CURSOR_CONFIG, "demo")).toBe(false);
      expect(JSON.stringify(workspace.readSettings())).not.toContain('"demo"');
    }),
  );

  const outcomeRows = [
    { agentId: "claude-code", outcome: "current" },
    { agentId: "cursor", outcome: "current" },
    { agentId: "amp", outcome: "unsupported" },
  ] as const;

  it.effect.each(outcomeRows)(
    "the inventory reports $agentId as $outcome instead of omitting it",
    (row) =>
      Effect.gen(function* () {
        const workspace = workspaceWithAgents(outcomeRows.map((entry) => entry.agentId));
        yield* addDemo(workspace);

        const outcomes = yield* listedOutcomes(workspace, "demo");

        expect(outcomes.map((outcome) => outcome.agentId).sort()).toEqual(
          outcomeRows.map((entry) => entry.agentId).sort(),
        );
        expect(outcomes.find((outcome) => outcome.agentId === row.agentId)?.outcome).toBe(
          row.outcome,
        );
        expect(outcomes.map((outcome) => outcome.outcome)).not.toContain("not-applicable");
      }),
  );
});
