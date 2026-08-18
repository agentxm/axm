import { describe, expect, it } from "@effect/vitest";
import {
  makeProjectionInvariantFact,
  projectionFactIsViolation,
  type ProjectionUnitObservation,
} from "./invariant-facts.js";

const observation = (
  overrides: Partial<ProjectionUnitObservation> = {},
): ProjectionUnitObservation => ({
  unitId: "rule:instructions-region",
  path: "AGENTS.md#rules",
  present: true,
  current: true,
  expectedContributors: ["@acme/rules/alpha", "@acme/rules/beta"],
  observedContributors: ["@acme/rules/alpha", "@acme/rules/beta"],
  ...overrides,
});

describe("projection invariant facts", () => {
  it("classifies a partial aggregate output as incomplete from output evidence", () => {
    const fact = makeProjectionInvariantFact(
      observation({
        current: false,
        observedContributors: ["@acme/rules/alpha"],
      }),
      "project",
    );

    expect(fact).toEqual({
      predicate: "workspace/projection-current",
      subject: {
        unitId: "rule:instructions-region",
        path: "AGENTS.md#rules",
        scope: "project",
      },
      authority: {
        source: "desired-state-graph",
        contributors: ["@acme/rules/alpha", "@acme/rules/beta"],
      },
      observation: {
        status: "incomplete",
        contributors: ["@acme/rules/alpha"],
      },
      expectation: {
        status: "current",
        contributors: ["@acme/rules/alpha", "@acme/rules/beta"],
      },
      affectedContributors: ["@acme/rules/beta"],
    });
    expect(projectionFactIsViolation(fact)).toBe(true);
  });

  it("distinguishes missing, stale, obsolete, and current units", () => {
    const statuses = [
      makeProjectionInvariantFact(observation({ present: false, current: false }), "project"),
      makeProjectionInvariantFact(observation({ current: false }), "project"),
      makeProjectionInvariantFact(
        observation({
          current: false,
          expectedContributors: [],
          observedContributors: ["@acme/rules/obsolete"],
        }),
        "project",
      ),
      makeProjectionInvariantFact(observation(), "project"),
    ].map((fact) => fact.observation.status);

    expect(statuses).toEqual(["missing", "stale", "obsolete", "current"]);
  });
});
