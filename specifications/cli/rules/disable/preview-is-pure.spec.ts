import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  expectNoOpPlanResult,
  handleDisableRule,
  handleInstallRule,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { writeLocalRulePackage } from "../../../support/extension-fixtures.js";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/rules/disable/preview-is-pure",
  title: "Rule disable preview describes the deactivation without changing any state",
  statement:
    "When rules disable runs in preview mode against an enabled rule, it shall report the deactivation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent instruction files.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/activation-follows-desired-state", "cli/skills/enable/preview-is-pure"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Rule disable preview purity", () => {
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
      const packageRoot = writeLocalRulePackage(workspace.root, { name: "commit-style" });
      yield* handleInstallRule({ source: packageRoot }, { force: false, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      expect(workspace.readFile("AGENTS.md")).toContain("@acme/rules/commit-style");
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);
      return workspace;
    });

  it.effect("a previewed disable of an enabled rule changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = yield* enabledWorkspace();
      const before = snapshotProtectedState(workspace.root);

      yield* handleDisableRule({ name: "commit-style", preview: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.readFile("AGENTS.md")).toContain("@acme/rules/commit-style");
      expect(JSON.stringify(workspace.readSettings())).not.toContain('"enabled":false');
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          planName: "Disable rules",
          units: [{ label: "commit-style", state: "ready" }],
        },
      });
    }),
  );

  it.effect("a previewed disable of an unconfigured name reports nothing to do", () =>
    Effect.gen(function* () {
      const workspace = yield* enabledWorkspace();
      const before = snapshotProtectedState(workspace.root);

      yield* handleDisableRule({ name: "missing", preview: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      expectNoOpPlanResult(workspace.rendererState.results[0]?.data, {
        planName: "Disable rules",
        message: 'rule "missing" is not configured',
      });
    }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["rules", "disable"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["rules", "disable"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["rules", "disable"], "-y")).toBe("unrecognized");
    }),
  );
});
