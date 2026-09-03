import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  handleMcpsImport,
  handleSync,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { planTargetPaths, planUnitIds } from "../../../support/plan-targets.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/import/adoption-reaches-every-configured-agent",
  title: "An imported MCP server is adopted once and reaches every configured agent",
  statement:
    "When an MCP server found in one agent's native configuration is imported, AXM shall record it once without an agent subset, shall project it to every configured agent that can represent it on the next reconciliation, and shall report every native target it will write in preview and apply.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "agent-interoperability"],
  status: "accepted",
  methods: ["example"],
  derivedFrom: [
    "cli/mcps/inline-lifecycle-is-idempotent",
    "cli/sync/realizes-desired-state",
    "packages/cli/src/root/mcps/import.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [
    "Claude Code and Cursor keep distinct project-scope MCP configuration files, so a server present in one file and absent from the other observes adoption reaching a second agent.",
  ],
  openQuestions: [],
});

const CLAUDE_CODE_CONFIG = ".mcp.json";
const CURSOR_CONFIG = ".cursor/mcp.json";

type SpecWorkspace = ReturnType<typeof makeSpecWorkspace>;

const seedCursorServer = (workspace: SpecWorkspace): void => {
  fs.mkdirSync(path.join(workspace.root, ".cursor"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace.root, CURSOR_CONFIG),
    `${JSON.stringify({ mcpServers: { demo: { command: "node", args: ["server.js"] } } }, null, 2)}\n`,
  );
};

const nativeServer = (workspace: SpecWorkspace, file: string): unknown =>
  JSON.parse(workspace.readFile(file));

const settingsEntry = (workspace: SpecWorkspace, name: string): unknown => {
  const settings = workspace.readSettings();
  if (typeof settings !== "object" || settings === null || !("mcpServers" in settings)) {
    throw new Error("Expected axm.json with an mcpServers map");
  }
  const servers = settings.mcpServers;
  if (typeof servers !== "object" || servers === null || !(name in servers)) {
    throw new Error(`Expected axm.json to configure MCP server ${name}`);
  }
  return Object.entries(servers).find(([key]) => key === name)?.[1];
};

describe("Importing a natively configured MCP server", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const seededWorkspace = () => {
    const workspace = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      settings: { agents: ["claude-code", "cursor"] },
    });
    cleanups.push(workspace.cleanup);
    seedCursorServer(workspace);
    return workspace;
  };

  const importServers = (workspace: SpecWorkspace, preview: boolean) =>
    handleMcpsImport({ yes: true, preview }).pipe(Effect.provide(workspace.layer));

  const sync = (workspace: SpecWorkspace, preview: boolean) =>
    handleSync({ preview }).pipe(Effect.provide(workspace.layer));

  it.effect(
    "import records the server once, without an agent subset, on the same targets it previewed",
    () =>
      Effect.gen(function* () {
        const workspace = seededWorkspace();

        yield* importServers(workspace, true);
        const previewed = workspace.rendererState.results.at(-1)?.data;
        expectPreviewedPlanResult(previewed, { planName: "Import MCP servers", totalSteps: 1 });
        expect(fs.existsSync(path.join(workspace.root, CLAUDE_CODE_CONFIG))).toBe(false);

        yield* importServers(workspace, false);
        const applied = workspace.rendererState.results.at(-1)?.data;
        expectAppliedPlanResult(applied, {
          planName: "Import MCP servers",
          totalSteps: 1,
          appliedCount: 1,
        });

        expect(planTargetPaths(applied)).toEqual(planTargetPaths(previewed));
        expect(planTargetPaths(applied)).toContain(CURSOR_CONFIG);
        const entry = settingsEntry(workspace, "demo");
        expect(entry).toMatchObject({ command: "node", args: ["server.js"] });
        expect(JSON.stringify(entry)).not.toContain('"agents"');
      }),
  );

  it.effect("the next reconciliation projects the imported server to every configured agent", () =>
    Effect.gen(function* () {
      const workspace = seededWorkspace();
      yield* importServers(workspace, false);

      yield* sync(workspace, true);
      const previewed = workspace.rendererState.results.at(-1)?.data;
      expect(planUnitIds(previewed)).toEqual([expect.stringContaining("demo")]);
      expect(fs.existsSync(path.join(workspace.root, CLAUDE_CODE_CONFIG))).toBe(false);

      yield* sync(workspace, false);
      const applied = workspace.rendererState.results.at(-1)?.data;
      expect(planUnitIds(applied)).toEqual(planUnitIds(previewed));

      for (const file of [CLAUDE_CODE_CONFIG, CURSOR_CONFIG]) {
        expect(nativeServer(workspace, file), file).toMatchObject({
          mcpServers: { demo: expect.objectContaining({ command: "node", args: ["server.js"] }) },
        });
      }

      yield* sync(workspace, false);
      expectNoOpPlanResult(workspace.rendererState.results.at(-1)?.data, {
        planName: "Sync workspace",
      });
    }),
  );
});
