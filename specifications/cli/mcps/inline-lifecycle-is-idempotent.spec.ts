import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  expectNoOpPlanResult,
  handleMcpsAdd,
  handleUninstallMcpServer,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/inline-lifecycle-is-idempotent",
  title: "Inline MCP server add and uninstall are safe to repeat",
  statement:
    "Repeating an identical inline MCP server add, or repeating its uninstall, shall change no workspace configuration or agent projection and shall report a no-op.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Inline MCP server lifecycle is safe to repeat", () => {
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
      force: false,
      preview: false,
    }).pipe(Effect.provide(workspace.layer));

  const uninstallDemo = (workspace: ReturnType<typeof makeSpecWorkspace>) =>
    handleUninstallMcpServer({ serverName: "demo" }, { preview: false }).pipe(
      Effect.provide(workspace.layer),
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

  it.effect("repeating the uninstall reports nothing left to do", () =>
    Effect.gen(function* () {
      const workspace = lifecycleWorkspace();
      yield* addDemo(workspace);
      yield* uninstallDemo(workspace);
      const settingsBefore = workspace.readFile("axm.json");
      const nativeBefore = workspace.readFile(".mcp.json");

      yield* uninstallDemo(workspace);

      const lastResult = workspace.rendererState.results.at(-1);
      expect(lastResult?.data).toMatchObject({ result: { outcome: "no-op" } });
      expect(workspace.readFile("axm.json")).toBe(settingsBefore);
      expect(workspace.readFile(".mcp.json")).toBe(nativeBefore);
    }),
  );
});
