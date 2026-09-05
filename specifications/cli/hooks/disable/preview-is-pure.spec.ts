import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  expectNoOpPlanResult,
  handleDisableHook,
  handleInstallHook,
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
  requirement: "cli/hooks/disable/preview-is-pure",
  title: "Hooks package disable preview describes the deactivation without changing any state",
  statement:
    "When hooks disable runs in preview mode against an enabled hooks package, it shall report the deactivation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent hook configuration.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/activation-follows-desired-state", "cli/skills/enable/preview-is-pure"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Hooks package disable preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const enabledWorkspace = () =>
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
      expect(workspace.readFile(".claude/settings.json")).toContain("hook:tool-audit");
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);
      return workspace;
    });

  it.effect("a previewed disable of an enabled hooks package changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = yield* enabledWorkspace();
      const before = snapshotProtectedState(workspace.root);

      yield* handleDisableHook({ name: "tool-audit", preview: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.readFile(".claude/settings.json")).toContain("hook:tool-audit");
      expect(JSON.stringify(workspace.readSettings())).not.toContain('"enabled":false');
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          planName: "Disable hooks",
          units: [{ label: "tool-audit", state: "ready" }],
        },
      });
    }),
  );

  it.effect("a previewed disable of an unconfigured name reports nothing to do", () =>
    Effect.gen(function* () {
      const workspace = yield* enabledWorkspace();
      const before = snapshotProtectedState(workspace.root);

      yield* handleDisableHook({ name: "missing", preview: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      expectNoOpPlanResult(workspace.rendererState.results[0]?.data, {
        planName: "Disable hooks",
        message: 'hooks package "missing" is not configured',
      });
    }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["hooks", "disable"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["hooks", "disable"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["hooks", "disable"], "-y")).toBe("unrecognized");
    }),
  );
});
