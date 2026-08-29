import { describe, expect, it } from "@effect/vitest";
import { findingsForProjectionFacts } from "@agentxm/client-core/unstable/lint";
import {
  makeProjectionInvariantFact,
  type ProjectionUnitObservation,
} from "@agentxm/client-core/unstable/projection";
import { projectionDivergenceLabel, projectionFactsNeedReconciliation } from "./handler.js";

const base: ProjectionUnitObservation = {
  unitId: "rule:instructions-region",
  path: "AGENTS.md#rules",
  present: true,
  current: true,
  expectedContributors: ["@acme/rules/alpha", "@acme/rules/beta"],
  observedContributors: ["@acme/rules/alpha", "@acme/rules/beta"],
};

describe("projection fact consumers", () => {
  it("keeps lint and sync equivalent for every intrinsic projection status", () => {
    const observations: ReadonlyArray<ProjectionUnitObservation> = [
      base,
      { ...base, current: false },
      { ...base, current: false, present: false, observedContributors: [] },
      { ...base, current: false, observedContributors: ["@acme/rules/alpha"] },
      {
        ...base,
        current: false,
        expectedContributors: [],
        observedContributors: ["@acme/rules/obsolete"],
      },
    ];

    for (const observation of observations) {
      const facts = [makeProjectionInvariantFact(observation, "project")];
      expect(findingsForProjectionFacts(facts).length > 0).toBe(
        projectionFactsNeedReconciliation(facts),
      );
    }

    const incompleteFacts = [
      makeProjectionInvariantFact(
        { ...base, current: false, observedContributors: ["@acme/rules/alpha"] },
        "project",
      ),
    ];
    expect(findingsForProjectionFacts(incompleteFacts)[0]?.message).toContain("@acme/rules/beta");
    expect(projectionDivergenceLabel("instruction files", incompleteFacts)).toBe(
      "instruction files (incomplete: @acme/rules/beta)",
    );
  });
});
