import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstallMcpServer, handleUninstallMcpServer } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";
import { makeSpecRegistry } from "../../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/uninstall/preview-is-pure",
  title: "MCP server uninstall preview describes the removal without changing any state",
  statement:
    "When mcps uninstall runs in preview mode against an installed MCP server, it shall report the removal it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent MCP configuration.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/mcps/uninstall/removes-one-local-connection-at-a-time"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("MCP server uninstall preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const installedWorkspace = () =>
    Effect.gen(function* () {
      const registry = makeSpecRegistry();
      registry.writeMcp("context", [{ version: "1.0.0" }]);
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        recordWrites: true,
        settings: { sources: [registry.source] },
      });
      cleanups.push(workspace.cleanup, registry.cleanup);
      yield* handleInstallMcpServer(
        { source: Option.some("@acme/mcps/context"), env: [] },
        { force: false, preview: false },
      ).pipe(Effect.provide(workspace.layer));
      expect(workspace.readFile(".mcp.json")).toContain("context");
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);
      return workspace;
    });

  it.effect("a previewed uninstall of an installed MCP server changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = yield* installedWorkspace();
      const before = snapshotProtectedState(workspace.root);

      yield* handleUninstallMcpServer({ serverName: "context" }, { preview: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.readFile(".mcp.json")).toContain("context");
      expect(workspace.exists("agent_extensions/agentxm/@acme/mcps/context/mcp.json")).toBe(true);
      expect(workspace.readLockfileText()).toContain("resolvedVersion: 1.0.0");
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          planName: "Uninstall MCP server",
          units: [{ label: "context", state: "ready" }],
        },
      });
    }),
  );

  it.effect(
    "a previewed uninstall of an unknown name reports the absence and changes nothing",
    () =>
      Effect.gen(function* () {
        const workspace = yield* installedWorkspace();
        const before = snapshotProtectedState(workspace.root);

        yield* handleUninstallMcpServer({ serverName: "missing" }, { preview: true }).pipe(
          Effect.provide(workspace.layer),
        );

        expectProtectedStateUntouched({
          root: workspace.root,
          before,
          writes: workspace.writes,
        });
        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
        const [entry] = workspace.rendererState.results;
        expect(entry?.data).toMatchObject({
          result: {
            outcome: "previewed",
            counts: { committed: 0 },
            units: [
              {
                label: "missing",
                state: "ready",
                agentOutcomes: [{ outcome: "not-applicable", reasonCode: "extension-absent" }],
              },
            ],
          },
        });
      }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["mcps", "uninstall"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["mcps", "uninstall"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["mcps", "uninstall"], "-y")).toBe("unrecognized");
    }),
  );
});
