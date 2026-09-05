import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  expectNoOpPlanResult,
  handleInstallRule,
  handleUninstallRule,
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
  requirement: "cli/rules/uninstall/preview-is-pure",
  title: "Rule uninstall preview describes the removal without changing any state",
  statement:
    "When rules uninstall runs in preview mode against an installed rule, it shall report the removal it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent instruction files.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/every-type-completes-the-shared-lifecycle"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Rule uninstall preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const installedWorkspace = () =>
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

  it.effect("a previewed uninstall of an installed rule changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = yield* installedWorkspace();
      const before = snapshotProtectedState(workspace.root);

      yield* handleUninstallRule({ name: "commit-style" }, { preview: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.readFile("AGENTS.md")).toContain("@acme/rules/commit-style");
      expect(workspace.exists("agent_extensions/local/vendor/commit-style/src/RULE.md")).toBe(true);
      expect(workspace.readLockfileText()).toContain("commit-style");
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          units: [{ label: "commit-style", state: "ready" }],
        },
      });
    }),
  );

  it.effect("a previewed uninstall of an unknown name reports nothing to do", () =>
    Effect.gen(function* () {
      const workspace = yield* installedWorkspace();
      const before = snapshotProtectedState(workspace.root);

      yield* handleUninstallRule({ name: "missing" }, { preview: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      expectNoOpPlanResult(workspace.rendererState.results[0]?.data, {
        planName: "Uninstall rule",
        message: "No rules uninstalled.",
      });
    }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["rules", "uninstall"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["rules", "uninstall"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["rules", "uninstall"], "-y")).toBe("unrecognized");
    }),
  );
});
