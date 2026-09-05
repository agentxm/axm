import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  expectNoOpPlanResult,
  handleInstallMcpServer,
  handleWorkspaceUpdate,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";
import { makeSpecRegistry } from "../../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/update/preview-is-pure",
  title: "MCP server update preview describes the update without changing any state",
  statement:
    "When mcps update runs in preview mode against an installed MCP server whose source publishes a newer eligible version, it shall report the update it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent MCP configuration.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/mcps/update/shared-source-update-is-closure-wide"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const PLAN_NAME = "Update configured MCP servers";

describe("MCP server update preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const outdatedWorkspace = () =>
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
      registry.writeMcp("context", [{ version: "1.0.0" }, { version: "2.0.0" }]);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);
      return workspace;
    });

  const previewUpdate = (
    workspace: ReturnType<typeof makeSpecWorkspace>,
    names?: ReadonlyArray<string>,
  ) =>
    handleWorkspaceUpdate({
      command: "mcps.update",
      type: Option.some("mcp-server"),
      planName: PLAN_NAME,
      planDescription: Option.some(PLAN_NAME),
      flags: { preview: true },
      ...(names === undefined ? {} : { names }),
    }).pipe(Effect.provide(workspace.layer));

  it.effect("a previewed update to a newer version changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = yield* outdatedWorkspace();
      const before = snapshotProtectedState(workspace.root);

      yield* previewUpdate(workspace);

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.readLockfileText()).toContain("resolvedVersion: 1.0.0");
      expect(workspace.readLockfileText()).not.toContain("2.0.0");
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          planName: PLAN_NAME,
          units: [{ label: "context", state: "ready" }],
        },
      });
    }),
  );

  it.effect("a previewed update selecting no configured server reports nothing to do", () =>
    Effect.gen(function* () {
      const workspace = yield* outdatedWorkspace();
      const before = snapshotProtectedState(workspace.root);

      yield* previewUpdate(workspace, ["missing"]);

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      expectNoOpPlanResult(workspace.rendererState.results[0]?.data, { planName: PLAN_NAME });
    }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["mcps", "update"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["mcps", "update"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["mcps", "update"], "-y")).toBe("unrecognized");
    }),
  );
});
