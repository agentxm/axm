import { describe, expect, it } from "@effect/vitest";
import {
  extensionConstraintFactText,
  makeExtensionConstraintInvariantFact,
  makeProspectiveExtensionConstraintFacts,
  planExtensionConstraintFact,
} from "./constraint-invariant-fact.js";
import type { CanonicalConstraintMismatchObservation } from "../workspace/canonical-observation.js";
import type { DesiredExtensionNode } from "../workspace/desired-state-graph.js";

const desired = {
  type: "skill",
  name: "review",
  identity: "@acme/skills/review",
  source: "@acme/skills/review@>=2.0.0 <3.0.0",
  enabled: true,
  constraints: [">=2.0.0 <3.0.0", "^2.1.0"],
  origins: [],
} satisfies DesiredExtensionNode;

const observation = {
  type: "skill",
  name: "review",
  status: "constraint-mismatch",
  path: "/workspace/agent_extensions/@acme/skills/review",
  acceptedVersion: "1.9.0",
  observedVersion: "1.9.0",
  authority: {
    source: "desired-state-graph",
    identity: "@acme/skills/review",
    locator: desired.source,
    constraints: [
      {
        source: "pack",
        dependingPack: "@acme/packs/alpha",
        range: ">=2.0.0 <3.0.0",
        location: "/workspace/agent_extensions/@acme/packs/alpha/pack.json",
      },
      {
        source: "pack",
        dependingPack: "@acme/packs/beta",
        range: "^2.1.0",
        location: "/workspace/agent_extensions/@acme/packs/beta/pack.json",
      },
    ],
  },
} satisfies CanonicalConstraintMismatchObservation;

describe("extension constraint invariant facts", () => {
  it("preserves every constraint and classifies a satisfying closure-local transition", () => {
    const fact = makeExtensionConstraintInvariantFact(desired, observation);

    expect(fact).toMatchObject({
      predicate: "workspace/extension-constraints-satisfied",
      subject: { identity: "@acme/skills/review" },
      observation: { acceptedVersion: "1.9.0", observedVersion: "1.9.0" },
      expectation: { ranges: ["^2.1.0", ">=2.0.0 <3.0.0"] },
    });
    expect(planExtensionConstraintFact(fact, "2.2.0")).toEqual({
      readiness: "ready",
      reason: "satisfying-version-resolved",
      version: "2.2.0",
    });
    expect(extensionConstraintFactText(fact)).toContain("@acme/packs/alpha range=>=2.0.0 <3.0.0");
    expect(extensionConstraintFactText(fact)).toContain("@acme/packs/beta range=^2.1.0");
  });

  it("derives prospective publish facts from every locally represented Pack constraint", () => {
    const facts = makeProspectiveExtensionConstraintFacts({
      candidates: [
        {
          fqn: "@acme/skills/review",
          type: "skill",
          version: "0.0.5",
        },
      ],
      reachability: [
        {
          packFqn: "@acme/packs/quality",
          packAuthority: "registry",
          manifestPath: "agent_extensions/@acme/packs/quality/pack.json",
          memberFqn: "@acme/skills/review",
          constraint: "^0.0.3",
          memberVersion: "0.0.4",
          memberAuthority: "workspace",
          classification: "excluded",
        },
        {
          packFqn: "@acme/packs/reviewers",
          packAuthority: "workspace",
          manifestPath: "agent_extensions/@acme/packs/reviewers/pack.json",
          memberFqn: "@acme/skills/review",
          constraint: "^0.0.4",
          memberVersion: "0.0.4",
          memberAuthority: "workspace",
          classification: "satisfying",
        },
      ],
    });

    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      predicate: "workspace/extension-constraints-satisfied",
      subject: { identity: "@acme/skills/review" },
      authority: {
        source: "prospective-publish-selection",
        constraints: [
          { dependingPack: "@acme/packs/quality", range: "^0.0.3", authority: "registry" },
          { dependingPack: "@acme/packs/reviewers", range: "^0.0.4", authority: "workspace" },
        ],
      },
      observation: {
        candidateVersion: "0.0.5",
        violations: [
          { dependingPack: "@acme/packs/quality", range: "^0.0.3" },
          { dependingPack: "@acme/packs/reviewers", range: "^0.0.4" },
        ],
      },
    });
  });

  it("uses selected Pack manifests as prospective state", () => {
    const reachability = [
      {
        packFqn: "@acme/packs/reviewers",
        packAuthority: "workspace" as const,
        manifestPath: "agent_extensions/@acme/packs/reviewers/pack.json",
        memberFqn: "@acme/skills/review",
        constraint: "^0.0.4",
        memberVersion: "0.0.4",
        memberAuthority: "workspace" as const,
        classification: "satisfying" as const,
      },
    ];
    const leaf = {
      fqn: "@acme/skills/review",
      type: "skill" as const,
      version: "0.0.5",
    };

    expect(
      makeProspectiveExtensionConstraintFacts({
        candidates: [
          leaf,
          {
            fqn: "@acme/packs/reviewers",
            type: "pack",
            version: "0.1.1",
            dependencies: { "@acme/skills/review": "^0.0.5" },
          },
        ],
        reachability,
      }),
    ).toEqual([]);
    expect(
      makeProspectiveExtensionConstraintFacts({
        candidates: [
          leaf,
          {
            fqn: "@acme/packs/reviewers",
            type: "pack",
            version: "0.1.1",
            dependencies: { "@acme/skills/review": "^0.0.4" },
          },
        ],
        reachability,
      }),
    ).toHaveLength(1);
  });

  it("returns a stable blocker when no satisfying candidate exists", () => {
    const fact = makeExtensionConstraintInvariantFact(desired, observation);

    expect(planExtensionConstraintFact(fact, undefined)).toEqual({
      readiness: "blocked",
      reason: "no-satisfying-version",
    });
    expect(planExtensionConstraintFact(fact, "3.0.0")).toEqual({
      readiness: "blocked",
      reason: "candidate-violates-constraints",
      candidateVersion: "3.0.0",
    });
  });
});
