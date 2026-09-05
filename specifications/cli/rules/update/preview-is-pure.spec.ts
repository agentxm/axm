import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  expectNoOpPlanResult,
  handleInstallRule,
  handleWorkspaceUpdate,
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
  requirement: "cli/rules/update/preview-is-pure",
  title: "Rule update preview describes the update without changing any state",
  statement:
    "When rules update runs in preview mode against an installed rule whose source has changed, it shall report the update it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent instruction files.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/every-type-completes-the-shared-lifecycle"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const PLAN_NAME = "Update rules";

describe("Rule update preview purity", () => {
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
      const packageRoot = writeLocalRulePackage(workspace.root, { name: "commit-style" });
      yield* handleInstallRule({ source: packageRoot }, { force: false, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      // A later revision of the same local package: the installed copy is now behind its source.
      writeLocalRulePackage(workspace.root, {
        name: "commit-style",
        version: "1.1.0",
        description: "The revised commit-style rule.",
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
      command: "rules.update",
      type: Option.some("rule"),
      planName: PLAN_NAME,
      planDescription: Option.some("Update configured rules"),
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
      expect(workspace.readFile("agent_extensions/local/vendor/commit-style/rule.json")).toContain(
        '"version": "1.0.0"',
      );
      expect(workspace.readFile("AGENTS.md")).not.toContain("revised");
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          planName: PLAN_NAME,
          units: [{ label: "commit-style", state: "ready" }],
        },
      });
    }),
  );

  it.effect("a previewed update selecting no configured rule reports nothing to do", () =>
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
      expect(yield* probeFlag(["rules", "update"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["rules", "update"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["rules", "update"], "-y")).toBe("unrecognized");
    }),
  );
});
