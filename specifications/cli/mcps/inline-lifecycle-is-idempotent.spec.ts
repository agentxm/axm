import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import * as fs from "node:fs";
import * as path from "node:path";

import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  handleMcpsAdd,
  handleUninstallMcpServer,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/inline-lifecycle-is-idempotent",
  title: "The inline MCP server lifecycle is explicit and safe to repeat",
  statement:
    "Adding an inline MCP server shall record it in axm.json and project it to agents without recording a resolution, uninstalling it shall remove only that configuration and its projections, and repeating either operation shall change nothing and report a no-op.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Inline MCP server lifecycle", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const lifecycleWorkspace = () => {
    const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
    cleanups.push(workspace.cleanup);
    return workspace;
  };

  const addDemo = (workspace: ReturnType<typeof makeSpecWorkspace>) =>
    handleMcpsAdd({
      name: "demo",
      command: Option.some("node server.js"),
      url: Option.none(),
      env: [],
      header: [],
      yes: true,
      force: false,
      preview: false,
    }).pipe(Effect.provide(workspace.layer));

  const uninstallDemo = (workspace: ReturnType<typeof makeSpecWorkspace>) =>
    handleUninstallMcpServer({ serverName: "demo" }, { yes: true, preview: false }).pipe(
      Effect.provide(workspace.layer),
    );

  const addUnownedNativeEntry = (workspace: ReturnType<typeof makeSpecWorkspace>) => {
    const config: unknown = JSON.parse(workspace.readFile(".mcp.json"));
    if (typeof config !== "object" || config === null || !("mcpServers" in config)) {
      throw new Error("Expected .mcp.json with an mcpServers map");
    }
    const servers = config.mcpServers;
    if (typeof servers !== "object" || servers === null) {
      throw new Error("Expected the mcpServers map to be an object");
    }
    const next = {
      ...config,
      mcpServers: { ...servers, keep: { command: "node", args: ["keep.js"] } },
    };
    fs.writeFileSync(path.join(workspace.root, ".mcp.json"), `${JSON.stringify(next, null, 2)}\n`);
  };

  it.effect("adding an inline server records authoritative configuration and projects it", () =>
    Effect.gen(function* () {
      const workspace = lifecycleWorkspace();

      yield* addDemo(workspace);

      expect(workspace.readSettings()).toMatchObject({
        mcpServers: { demo: { command: "node", args: ["server.js"] } },
      });
      const nativeConfig: unknown = JSON.parse(workspace.readFile(".mcp.json"));
      expect(nativeConfig).toMatchObject({
        mcpServers: { demo: expect.objectContaining({ command: "node", args: ["server.js"] }) },
      });
      expectAppliedPlanResult(workspace.rendererState.results[0]?.data, {
        planName: "Add MCP server",
        totalSteps: 2,
        appliedCount: 2,
      });
      // Inline configuration is authoritative — no accepted resolution is recorded.
      expect(workspace.readLockfileText()).not.toContain("demo");
    }),
  );

  it.effect("repeating an identical add changes nothing and says so", () =>
    Effect.gen(function* () {
      const workspace = lifecycleWorkspace();
      yield* addDemo(workspace);
      const settingsBefore = workspace.readFile("axm.json");
      const nativeBefore = workspace.readFile(".mcp.json");

      yield* addDemo(workspace);

      const lastResult = workspace.rendererState.results.at(-1);
      expectNoOpPlanResult(lastResult?.data, {
        planName: "Add MCP server",
        message: "MCP server demo is already configured",
      });
      expect(workspace.readFile("axm.json")).toBe(settingsBefore);
      expect(workspace.readFile(".mcp.json")).toBe(nativeBefore);
    }),
  );

  it.effect(
    "uninstalling removes the configuration and its projections while preserving unowned entries",
    () =>
      Effect.gen(function* () {
        const workspace = lifecycleWorkspace();
        yield* addDemo(workspace);
        addUnownedNativeEntry(workspace);

        yield* uninstallDemo(workspace);

        expect(JSON.stringify(workspace.readSettings())).not.toContain('"demo"');
        const nativeConfig: unknown = JSON.parse(workspace.readFile(".mcp.json"));
        expect(nativeConfig).toMatchObject({
          mcpServers: { keep: { command: "node", args: ["keep.js"] } },
        });
        expect(JSON.stringify(nativeConfig)).not.toContain('"demo"');
      }),
  );

  it.effect("repeating the uninstall reports nothing left to do", () =>
    Effect.gen(function* () {
      const workspace = lifecycleWorkspace();
      yield* addDemo(workspace);
      yield* uninstallDemo(workspace);
      const settingsBefore = workspace.readFile("axm.json");

      yield* uninstallDemo(workspace);

      const lastResult = workspace.rendererState.results.at(-1);
      expect(lastResult?.data).toMatchObject({ result: { outcome: "no-op" } });
      expect(workspace.readFile("axm.json")).toBe(settingsBefore);
    }),
  );
});
