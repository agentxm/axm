import { describe, expect, it } from "@effect/vitest";
import {
  makeProjectionInvariantFact,
  projectionFactHasInvalidOwnership,
  projectionFactIsViolation,
  type ProjectionInvariantFact,
} from "./invariant-facts.js";
import type { ProjectionUnitObservation } from "./units.js";

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
  it("classifies partial structured output as incomplete from exact evidence", () => {
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
    });
    expect(projectionFactIsViolation(fact)).toBe(true);
  });

  it("classifies opaque aggregate divergence as stale without contributor evidence", () => {
    const fact = makeProjectionInvariantFact(
      {
        unitId: "rule:instructions-region",
        path: "AGENTS.md#rules",
        present: true,
        current: false,
        expectedContributors: ["@acme/rules/alpha", "@acme/rules/beta"],
      },
      "project",
    );

    expect(fact.observation).toEqual({ status: "stale" });
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

  it("treats malformed region fences as a blocking unavailable unit, not drift", () => {
    const fact: ProjectionInvariantFact = {
      predicate: "workspace/projection-current",
      subject: {
        unitId: "rule:instructions-region",
        path: "AGENTS.md#rules",
        scope: "project",
        owner: "@agentxm/rules/instructions",
      },
      authority: { source: "desired-state-graph", contributors: [] },
      observation: {
        status: "unavailable",
        contributors: [],
        reasonCode: "invalid-ownership",
        message:
          'AXM cannot safely update its section in AGENTS.md: AXM region "rules" has unpaired fences',
      },
      expectation: { status: "current", contributors: [] },
    };
    expect(projectionFactIsViolation(fact)).toBe(false);
    expect(projectionFactHasInvalidOwnership(fact)).toBe(true);
  });
});
