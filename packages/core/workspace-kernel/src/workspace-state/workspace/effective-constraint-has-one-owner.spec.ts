import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import {
  decodeVersionSync,
  normalizeVersionRequest,
  versionSatisfiesRequest,
} from "@agentxm/extension-model/unstable/version-constraints";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions";

import {
  desiredStateSettled,
  effectiveDesiredConstraint,
  observeAcceptedResolution,
  type DesiredEffectiveConstraint,
} from "../index.js";
import { makeRegistrySkillLockEntry } from "./test-stubs.js";
import {
  DISABLED_MCP,
  SHARED_MEMBER,
  SHARED_MEMBER_PACKS,
  SHARED_MEMBER_PIN,
  sharedMemberGraph,
} from "./test-scenarios.js";

export const specification = defineSpecification({
  requirement: "workspace/desired-state/effective-constraint-has-one-owner",
  title: "One effective constraint decides the version of every desired extension",
  statement:
    "The desired state shall give each desired extension one effective constraint that intersects its direct declaration with the range of every Pack that requires it and names every contributor, shall judge a Registry version that no contributor constrains exactly as `*` judges it, and when no version satisfies that intersection it shall report one conflict naming every contributor rather than letting any contributor's range win.",
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

/** The published Registry versions an effective range admits; an absent range is `*`. */
const admitted = (
  effective: DesiredEffectiveConstraint,
  versions: ReadonlyArray<string> = SHARED_MEMBER.versions,
): ReadonlyArray<string> =>
  versions.filter((version) =>
    versionSatisfiesRequest(version, normalizeVersionRequest(effective.range)),
  );

/** Published versions where the newest is a prerelease. */
const PRERELEASE_LED = ["1.9.0", "2.0.0-beta.1"] as const;

/** The scenario with only an unpinned direct declaration, or one spelled with `range`. */
const directOnlyGraph = (range?: string) =>
  sharedMemberGraph(SHARED_MEMBER_PIN.inside, {
    skills: {
      [SHARED_MEMBER.name]:
        range === undefined ? SHARED_MEMBER.fqn : `${SHARED_MEMBER.fqn}@${range}`,
    },
    packs: {},
  });

const acceptedAt = (version: string) =>
  makeRegistrySkillLockEntry({
    owner: decodeHandleSync(SHARED_MEMBER.owner),
    name: SHARED_MEMBER.name,
    resolvedVersion: decodeVersionSync(version),
  });

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
        expect(desiredStateSettled(graph)).toBe(false);
        expect(graph.problems.filter((problem) => problem.type === "constraint-conflict")).toEqual([
          effective.failure,
        ]);
      }),
  );

  it.effect(
    "a desired node carries the effective constraint and keeps the locator it declared",
    () =>
      Effect.gen(function* () {
        const graph = yield* sharedMemberGraph(SHARED_MEMBER_PIN.inside);
        const node = graph.nodes.find(
          (candidate) => candidate.type === member.type && candidate.name === member.name,
        );
        if (node === undefined) throw new Error("Expected the shared member to be desired");

        // The graph publishes the one answer on the node; no reader re-derives
        // a range from the declared locator or from one Pack's declaration.
        expect(node.constraint).toEqual(effectiveDesiredConstraint(graph, member));
        expect(node.source).toBe(`${SHARED_MEMBER.fqn}@${SHARED_MEMBER_PIN.inside}`);
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

  it.effect(
    "an unconstrained Registry member admits exactly what the wildcard admits, never a newer prerelease",
    () =>
      Effect.gen(function* () {
        const unpinned = effectiveDesiredConstraint(yield* directOnlyGraph(), member);
        const wildcard = effectiveDesiredConstraint(yield* directOnlyGraph("*"), member);

        if (Result.isFailure(unpinned) || Result.isFailure(wildcard))
          throw new Error("Expected a satisfiable constraint");
        expect(unpinned.success).toEqual({ range: Option.none(), contributors: [] });
        expect(admitted(unpinned.success, PRERELEASE_LED)).toEqual(["1.9.0"]);
        expect(admitted(unpinned.success, PRERELEASE_LED)).toEqual(
          admitted(wildcard.success, PRERELEASE_LED),
        );
        expect(admitted(unpinned.success, ["2.0.0-beta.1"])).toEqual([]);
      }),
  );

  it.effect(
    "an accepted prerelease that no contributor's range names is a constraint mismatch",
    () =>
      Effect.gen(function* () {
        for (const range of [undefined, "*"]) {
          const graph = yield* directOnlyGraph(range);
          const node = graph.nodes.find(
            (candidate) => candidate.type === member.type && candidate.name === member.name,
          );
          if (node === undefined) throw new Error("Expected the member to be desired");

          // The held prerelease blocks; the stable release the request admits stands.
          expect(observeAcceptedResolution(node, acceptedAt("2.0.0-beta.1"))).toEqual(
            Option.some(
              expect.objectContaining({
                status: "constraint-mismatch",
                acceptedVersion: "2.0.0-beta.1",
              }),
            ),
          );
          expect(observeAcceptedResolution(node, acceptedAt("1.9.0"))).toEqual(Option.none());
        }
        const optedIn = (yield* directOnlyGraph(">=2.0.0-0")).nodes.find(
          (candidate) => candidate.type === member.type && candidate.name === member.name,
        );
        if (optedIn === undefined) throw new Error("Expected the member to be desired");
        expect(observeAcceptedResolution(optedIn, acceptedAt("2.0.0-beta.1"))).toEqual(
          Option.none(),
        );
      }),
  );
});
