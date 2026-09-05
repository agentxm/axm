import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  handleInstall,
  handleSkillsDisable,
  handleSkillsEnable,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/skills/enable/preview-is-pure",
  title: "Skill enable preview describes the activation without changing any state",
  statement:
    "When skills enable runs in preview mode against a disabled skill, it shall report the activation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/activation-follows-desired-state"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Skill enable preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("a previewed enable of a disabled skill changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        recordWrites: true,
      });
      cleanups.push(workspace.cleanup);
      const packageRoot = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      yield* handleInstall({ source: Option.some(packageRoot), force: false, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      yield* handleSkillsDisable({ name: "code-review", preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      expect(workspace.exists(".claude/skills/code-review")).toBe(false);
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);

      yield* handleSkillsEnable({ name: "code-review", preview: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.exists(".claude/skills/code-review")).toBe(false);
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: { outcome: "previewed", units: [{ label: "code-review", state: "ready" }] },
      });
    }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["skills", "enable"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["skills", "enable"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["skills", "enable"], "-y")).toBe("unrecognized");
    }),
  );
});
