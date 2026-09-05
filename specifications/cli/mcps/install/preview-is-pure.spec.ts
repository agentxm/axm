import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleInstallMcpServer } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";
import { makeSpecRegistry } from "../../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/install/preview-is-pure",
  title: "MCP server install preview describes the installation without changing any state",
  statement:
    "When mcps install runs in preview mode against a Registry MCP server that is not yet installed, it shall report the installation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent MCP configuration.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/mcps/install/local-connection-names-share-source-resolution"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("MCP server install preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const setup = () => {
    const registry = makeSpecRegistry();
    registry.writeMcp("context", [{ version: "1.0.0" }]);
    const workspace = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      recordWrites: true,
      settings: { sources: [registry.source] },
    });
    cleanups.push(workspace.cleanup, registry.cleanup);
    return workspace;
  };

  const previewInstall = (workspace: ReturnType<typeof makeSpecWorkspace>, source: string) =>
    handleInstallMcpServer(
      { source: Option.some(source), env: [] },
      { force: false, preview: true },
    ).pipe(Effect.provide(workspace.layer));

  it.effect("a previewed install of a Registry MCP server changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = setup();
      const before = snapshotProtectedState(workspace.root);

      yield* previewInstall(workspace, "@acme/mcps/context");

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.exists("agent_extensions")).toBe(false);
      expect(workspace.exists(".mcp.json")).toBe(false);
      expect(workspace.readLockfileText()).not.toContain("context");
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          planName: "Install MCP server",
          units: [{ label: "context", state: "ready" }],
        },
      });
    }),
  );

  it.effect(
    "a previewed install of an unknown Registry MCP server reports it and changes nothing",
    () =>
      Effect.gen(function* () {
        const workspace = setup();
        const before = snapshotProtectedState(workspace.root);

        const failure = yield* previewInstall(workspace, "@acme/mcps/missing").pipe(Effect.flip);

        expect(getAppError(failure).code).toBe("not_found");
        expectProtectedStateUntouched({
          root: workspace.root,
          before,
          writes: workspace.writes,
        });
        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["mcps", "install"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["mcps", "install"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["mcps", "install"], "-y")).toBe("unrecognized");
    }),
  );
});
