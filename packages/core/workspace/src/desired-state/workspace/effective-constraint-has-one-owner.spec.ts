import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as semver from "semver";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { effectiveDesiredConstraint, type DesiredEffectiveConstraint } from "../index.js";
import {
  DISABLED_MCP,
  SHARED_MEMBER,
  SHARED_MEMBER_PACKS,
  SHARED_MEMBER_PIN,
  sharedMemberGraph,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "workspace/desired-state/effective-constraint-has-one-owner",
  title: "One effective constraint decides the version of every desired extension",
  statement:
    "The desired state shall give each desired extension one effective constraint that intersects its direct declaration with the range of every Pack that requires it and names every contributor, and when no version satisfies that intersection it shall report one conflict naming every contributor rather than letting any contributor's range win.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  boundary: "memory",
  methods: ["example"],
  derivedFrom: ["docs/architecture/workspace/invariants.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const member = { type: "skill", name: SHARED_MEMBER.name } as const;

/** The published versions an effective range admits. */
const admitted = (effective: DesiredEffectiveConstraint): ReadonlyArray<string> =>
  SHARED_MEMBER.versions.filter((version) =>
    Option.match(effective.range, {
      onNone: () => true,
      onSome: (range) => semver.satisfies(version, range),
    }),
  );

const settingsContributor = (range: string) =>
  expect.objectContaining({ source: "settings", range, localName: SHARED_MEMBER.name });

const packContributors = SHARED_MEMBER_PACKS.map((pack) =>
  expect.objectContaining({ source: "pack", dependingPack: pack.fqn, range: pack.range }),
);

describe("The effective constraint has one owner", () => {
  it.effect(
    "a shared member's effective constraint is the intersection of its direct pin and every Pack range",
    () =>
      Effect.gen(function* () {
        const graph = yield* sharedMemberGraph(SHARED_MEMBER_PIN.inside);

        const effective = effectiveDesiredConstraint(graph, member);

        if (Result.isFailure(effective)) throw new Error("Expected a satisfiable constraint");
        expect(admitted(effective.success)).toEqual([SHARED_MEMBER_PIN.inside]);
        expect(effective.success.contributors).toEqual([
          settingsContributor(SHARED_MEMBER_PIN.inside),
          ...packContributors,
        ]);
        expect(graph.problems.filter((problem) => problem.type === "constraint-conflict")).toEqual(
          [],
        );
      }),
  );

  it.effect(
    "a direct pin outside every Pack range is one conflict that names all three contributors",
    () =>
      Effect.gen(function* () {
        const graph = yield* sharedMemberGraph(SHARED_MEMBER_PIN.outside);

        const effective = effectiveDesiredConstraint(graph, member);

        if (Result.isSuccess(effective)) throw new Error("Expected a constraint conflict");
        expect(effective.failure).toMatchObject({
          type: "constraint-conflict",
          extensionType: "skill",
          name: SHARED_MEMBER.name,
        });
        expect(effective.failure.contributors).toEqual([
          settingsContributor(SHARED_MEMBER_PIN.outside),
          ...packContributors,
        ]);
        // The graph reports the same blocker the query returns, once.
        expect(graph.complete).toBe(false);
        expect(graph.problems.filter((problem) => problem.type === "constraint-conflict")).toEqual([
          effective.failure,
        ]);
      }),
  );

  it.effect("a disabled declaration contributes to no other extension's constraint", () =>
    Effect.gen(function* () {
      const graph = yield* sharedMemberGraph(SHARED_MEMBER_PIN.inside);

      const connection = graph.nodes.find(
        (node) => node.type === "mcp-server" && node.name === DISABLED_MCP.name,
      );
      const effective = effectiveDesiredConstraint(graph, {
        type: "mcp-server",
        name: DISABLED_MCP.name,
      });

      expect(connection?.enabled).toBe(false);
      if (Result.isFailure(effective)) throw new Error("Expected a satisfiable constraint");
      expect(effective.success).toEqual({ range: Option.none(), contributors: [] });
      const shared = effectiveDesiredConstraint(graph, member);
      if (Result.isFailure(shared)) throw new Error("Expected a satisfiable constraint");
      expect(shared.success.contributors).toHaveLength(3);
    }),
  );

  it.effect("a proposed change replaces only its owner's contribution", () =>
    Effect.gen(function* () {
      const graph = yield* sharedMemberGraph(SHARED_MEMBER_PIN.inside);

      const repinned = effectiveDesiredConstraint(graph, member, [
        {
          source: "settings",
          range: "1.2.0",
          location: "axm.json",
          localName: SHARED_MEMBER.name,
        },
      ]);
      const [alpha, beta] = SHARED_MEMBER_PACKS;
      const advancedPack = effectiveDesiredConstraint(graph, member, [
        {
          source: "pack",
          dependingPack: alpha.fqn,
          range: "^2.0.0",
          location: `${alpha.fqn} proposed manifest`,
        },
      ]);

      if (Result.isFailure(repinned)) throw new Error("Expected a satisfiable constraint");
      expect(admitted(repinned.success)).toEqual(["1.2.0"]);
      expect(repinned.success.contributors).toEqual([
        settingsContributor("1.2.0"),
        ...packContributors,
      ]);
      if (Result.isSuccess(advancedPack)) throw new Error("Expected a constraint conflict");
      expect(advancedPack.failure.contributors).toEqual([
        settingsContributor(SHARED_MEMBER_PIN.inside),
        expect.objectContaining({ dependingPack: alpha.fqn, range: "^2.0.0" }),
        expect.objectContaining({ dependingPack: beta.fqn, range: beta.range }),
      ]);
    }),
  );

  it.effect(
    "a proposed declaration without a range leaves every Pack range deciding the constraint",
    () =>
      Effect.gen(function* () {
        const graph = yield* sharedMemberGraph(SHARED_MEMBER_PIN.outside);

        const unpinned = effectiveDesiredConstraint(graph, member, [
          { source: "settings", localName: SHARED_MEMBER.name },
        ]);

        if (Result.isFailure(unpinned)) throw new Error("Expected a satisfiable constraint");
        expect(admitted(unpinned.success)).toEqual(["1.0.0", "1.1.0", "1.2.0"]);
        expect(unpinned.success.contributors).toEqual(packContributors);
      }),
  );
});
