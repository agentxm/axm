import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleDemote } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";
import { probeFlag } from "../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../support/preview-purity.js";
import { writeAuthoredSkill } from "../../support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/demote/preview-is-pure",
  title: "Demote preview describes the authority transition without consuming approval",
  statement:
    "When demote runs in preview mode, it shall report the replacement it would apply with a previewed outcome that is identical with or without advance approval, shall not change settings, the lockfile, authored content, or agent projections, and an unattended apply without advance approval shall stop before changing anything and name the approval it needs.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** The assessed plan a preview renders, independent of when it rendered. */
const assessedPlan = (data: unknown): unknown => {
  if (!isRecord(data) || !isRecord(data["result"])) return undefined;
  const result = data["result"];
  return {
    planName: result["planName"],
    outcome: result["outcome"],
    counts: result["counts"],
    units: result["units"],
    riskConditions: result["riskConditions"],
  };
};

describe("Demote preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const authoredWorkspace = () => {
    const workspace = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      recordWrites: true,
      settings: { owner: "@acme", skills: { review: "workspace" } },
    });
    cleanups.push(workspace.cleanup);
    writeAuthoredSkill(workspace.root, { name: "review" });
    const replacement = writeLocalSkillPackage(workspace.root, {
      name: "review",
      body: "Replacement guidance.",
    });
    const before = snapshotProtectedState(workspace.root);
    workspace.writes.splice(0);
    workspace.rendererState.results.splice(0);
    return { workspace, replacement, before };
  };

  it.effect("a previewed demotion renders the same assessment with or without approval", () =>
    Effect.gen(function* () {
      const { workspace, replacement, before } = authoredWorkspace();

      yield* handleDemote({
        fqn: "@acme/skills/review",
        source: replacement,
        yes: false,
        preview: true,
      }).pipe(Effect.provide(workspace.layer));
      yield* handleDemote({
        fqn: "@acme/skills/review",
        source: replacement,
        yes: true,
        preview: true,
      }).pipe(Effect.provide(workspace.layer));

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.exists("skills/review/skill.json")).toBe(true);
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [withoutApproval, withApproval] = workspace.rendererState.results;
      expect(assessedPlan(withoutApproval?.data)).toMatchObject({
        planName: "Demote workspace extension",
        outcome: "previewed",
        units: [{ label: "Demote @acme/skills/review" }],
        riskConditions: [expect.objectContaining({ id: "replace-workspace-authority" })],
      });
      expect(assessedPlan(withApproval?.data)).toEqual(assessedPlan(withoutApproval?.data));
    }),
  );

  it.effect(
    "an unattended apply without advance approval stops before changing anything and names it",
    () =>
      Effect.gen(function* () {
        const { workspace, replacement, before } = authoredWorkspace();

        yield* handleDemote({
          fqn: "@acme/skills/review",
          source: replacement,
          yes: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));

        expectProtectedStateUntouched({
          root: workspace.root,
          before,
          writes: workspace.writes,
        });
        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
        const [entry] = workspace.rendererState.results;
        expect(entry?.ok).toBe(false);
        expect(entry?.data).toMatchObject({
          result: {
            outcome: "blocked",
            counts: { committed: 0 },
            blocking: {
              class: "approval-required",
              subject: "replace-workspace-authority",
              escape: {
                cmd: expect.stringMatching(/^axm demote .*--yes.* @acme\/skills\/review /u),
              },
            },
          },
        });
        expect(
          workspace.rendererState.suggestions.some(
            (suggestion) =>
              suggestion.cmd?.startsWith("axm demote ") === true &&
              suggestion.cmd.split(" ").includes("--yes"),
          ),
        ).toBe(true);
      }),
  );

  it.effect(
    "a previewed demotion of a non-authored extension reports the conflict and changes nothing",
    () =>
      Effect.gen(function* () {
        const { workspace, replacement, before } = authoredWorkspace();

        const failure = yield* handleDemote({
          fqn: "@acme/skills/missing",
          source: replacement,
          yes: false,
          preview: true,
        }).pipe(Effect.provide(workspace.layer), Effect.flip);

        expect(getAppError(failure).code).toBe("conflict");
        expectProtectedStateUntouched({
          root: workspace.root,
          before,
          writes: workspace.writes,
        });
      }),
  );

  it.effect("the route offers preview and the documented advance approval", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["demote"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["demote"], "--yes")).toBe("accepted");
      expect(yield* probeFlag(["demote"], "-y")).toBe("accepted");
    }),
  );
});
