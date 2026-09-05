import { describe, expect, it } from "@effect/vitest";
import { findingsForProjectionOwnership } from "@agentxm/workspace-lint";
import { makeProjectionInvariantFact } from "@agentxm/extension-workspace";
import { type ProjectionUnitObservation } from "@agentxm/extension-workspace";
import {
  projectionDivergenceLabel,
  projectionFactsNeedReconciliation,
} from "@agentxm/workspace-sync";

const base: ProjectionUnitObservation = {
  unitId: "rule:instructions-region",
  path: "AGENTS.md#rules",
  present: true,
  current: true,
  expectedContributors: ["@acme/rules/alpha", "@acme/rules/beta"],
  observedContributors: ["@acme/rules/alpha", "@acme/rules/beta"],
};

describe("projection fact consumers", () => {
  it("keeps convergence in sync without turning body currency into lint findings", () => {
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
      expect(findingsForProjectionOwnership(facts)).toEqual([]);
      expect(projectionFactsNeedReconciliation(facts)).toBe(observation.current === false);
    }

    const incompleteFacts = [
      makeProjectionInvariantFact(
        { ...base, current: false, observedContributors: ["@acme/rules/alpha"] },
        "project",
      ),
    ];
    expect(projectionDivergenceLabel("instruction files", incompleteFacts)).toBe(
      "instruction files (incomplete)",
    );
    expect(
      projectionDivergenceLabel("instruction files", [
        makeProjectionInvariantFact(
          {
            unitId: "rule:instructions-region",
            path: "AGENTS.md#rules",
            present: true,
            current: false,
            expectedContributors: ["@acme/rules/alpha", "@acme/rules/beta"],
          },
          "project",
        ),
      ]),
    ).toBe("instruction files (stale)");
  });
});
