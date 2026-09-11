import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleDemote } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/specification-metadata";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../support/preview-purity.js";
import { writeAuthoredSkill } from "../../support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/demote/preview-is-pure",
  title: "Demote preview describes the replacement without performing it",
  statement:
    "When demote runs in preview mode, it shall report the replacement it would apply with a previewed outcome naming the demotion unit and the workspace-authority risk it carries, and shall not change settings, the lockfile, authored content, or agent projections.",
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

  it.effect("a previewed demotion changes nothing and names the replacement it would apply", () =>
    Effect.gen(function* () {
      const { workspace, replacement, before } = authoredWorkspace();

      yield* handleDemote({
        fqn: "@acme/skills/review",
        source: replacement,
        yes: false,
        preview: true,
      }).pipe(Effect.provide(workspace.layer));

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.exists("skills/review/skill.json")).toBe(true);
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [previewed] = workspace.rendererState.results;
      expect(assessedPlan(previewed?.data)).toMatchObject({
        planName: "Demote workspace extension",
        outcome: "previewed",
        units: [{ label: "Demote @acme/skills/review" }],
        riskConditions: [expect.objectContaining({ id: "replace-workspace-authority" })],
      });
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
});
