import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  expectNoOpPlanResult,
  handleInstallHook,
  handleWorkspaceUpdate,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { writeLocalHookPackage } from "../../../support/extension-fixtures.js";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/hooks/update/preview-is-pure",
  title: "Hooks package update preview describes the update without changing any state",
  statement:
    "When hooks update runs in preview mode against an installed hooks package whose source has changed, it shall report the update it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent hook configuration.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/every-type-completes-the-shared-lifecycle"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const PLAN_NAME = "Update hooks";

describe("Hooks package update preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const outdatedWorkspace = () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        recordWrites: true,
      });
      cleanups.push(workspace.cleanup);
      const packageRoot = writeLocalHookPackage(workspace.root, { name: "tool-audit" });
      yield* handleInstallHook({ source: packageRoot }, { force: false, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      // A later revision of the same local package: the installed copy is now behind its source.
      writeLocalHookPackage(workspace.root, {
        name: "tool-audit",
        version: "1.1.0",
        description: "The revised tool-audit hook.",
      });
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);
      return workspace;
    });

  const previewUpdate = (
    workspace: ReturnType<typeof makeSpecWorkspace>,
    names?: ReadonlyArray<string>,
  ) =>
    handleWorkspaceUpdate({
      command: "hooks.update",
      type: Option.some("hook"),
      planName: PLAN_NAME,
      planDescription: Option.some("Update configured hooks packages"),
      flags: { preview: true },
      ...(names === undefined ? {} : { names }),
    }).pipe(Effect.provide(workspace.layer));

  it.effect("a previewed update to a revised source changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = yield* outdatedWorkspace();
      const before = snapshotProtectedState(workspace.root);

      yield* previewUpdate(workspace);

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.readFile("agent_extensions/local/vendor/tool-audit/hook.json")).toContain(
        '"version": "1.0.0"',
      );
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          planName: PLAN_NAME,
          units: [{ label: "tool-audit", state: "ready" }],
        },
      });
    }),
  );

  it.effect("a previewed update selecting no configured package reports nothing to do", () =>
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
      expect(yield* probeFlag(["hooks", "update"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["hooks", "update"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["hooks", "update"], "-y")).toBe("unrecognized");
    }),
  );
});
