import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import { decodeExtensionNameSync } from "../extensions/common.js";
import { decodeHandleSync } from "../extensions/handle.js";
import {
  decodeVersionRangeSync,
  decodeVersionSync,
} from "../version-constraints/version-constraints.js";
import {
  evaluatePackDependencies,
  type PackDependency,
  type PackDependencySnapshot,
  type PackPublicationCandidate,
} from "./dependency-policy.js";

const dependency: PackDependency = {
  owner: decodeHandleSync("@acme"),
  type: "skill",
  name: decodeExtensionNameSync("review"),
  range: decodeVersionRangeSync("^1.2.0"),
};
const snapshot: PackDependencySnapshot = {
  target: { owner: dependency.owner, type: dependency.type, name: dependency.name },
  exists: true,
  visibility: "public",
  lifecycleState: "active",
  deprecation: null,
  versions: [
    { version: decodeVersionSync("1.2.0"), status: "available", yanked: false, purged: false },
    { version: decodeVersionSync("1.4.0"), status: "available", yanked: false, purged: false },
  ],
};
const candidate: PackPublicationCandidate = {
  target: { ...snapshot.target, version: decodeVersionSync("1.5.0") },
  kind: "resolved",
  participation: "publish",
  visibility: "public",
};

describe("pack dependency policy", () => {
  it("admits a dependency published in the same complete prospective set", () => {
    expect(
      evaluatePackDependencies({
        packVisibility: "public",
        dependencies: [dependency],
        snapshots: [],
        candidates: [candidate],
      }),
    ).toEqual({ findings: [], resolutions: [{ dependency, effectiveVersion: "1.5.0" }] });
  });

  it("selects the highest installable satisfying version", () => {
    expect(
      evaluatePackDependencies({
        packVisibility: "public",
        dependencies: [dependency],
        snapshots: [snapshot],
      }),
    ).toEqual({ findings: [], resolutions: [{ dependency, effectiveVersion: "1.4.0" }] });
  });

  it("keeps each pack's requested range independent of shared extension facts", () => {
    const second = { ...dependency, range: decodeVersionRangeSync("^2.0.0") };
    const firstState = evaluatePackDependencies({
      packVisibility: "public",
      dependencies: [dependency],
      snapshots: [snapshot],
    });
    const secondState = evaluatePackDependencies({
      packVisibility: "public",
      dependencies: [second],
      snapshots: [snapshot],
    });
    expect(firstState).toEqual({
      findings: [],
      resolutions: [{ dependency, effectiveVersion: "1.4.0" }],
    });
    expect(secondState.findings).toMatchObject([
      { dependency: second, reason: "range-unsatisfied" },
    ]);
    expect(secondState.resolutions).toEqual([]);
  });

  it("allows private packs to resolve readable private dependencies", () => {
    expect(
      evaluatePackDependencies({
        packVisibility: "private",
        dependencies: [dependency],
        snapshots: [{ ...snapshot, visibility: "private" }],
      }),
    ).toEqual({ findings: [], resolutions: [{ dependency, effectiveVersion: "1.4.0" }] });
  });

  it.each([
    { current: [], reason: "selected-new-private" },
    { current: [snapshot], reason: "selected-existing-private" },
  ])("blocks a public pack on $reason", ({ current, reason }) => {
    const state = evaluatePackDependencies({
      packVisibility: "public",
      dependencies: [dependency],
      snapshots: current,
      candidates: [{ ...candidate, visibility: "private" }],
    });
    expect(state.findings).toMatchObject([
      { dependency, severity: "error", reason, effectiveVisibility: "private" },
    ]);
    expect(state.resolutions).toEqual([]);
  });

  it("does not disclose current facts for an unavailable selected target", () => {
    expect(
      evaluatePackDependencies({
        packVisibility: "public",
        dependencies: [dependency],
        snapshots: [snapshot],
        candidates: [{ target: snapshot.target, kind: "unavailable" }],
      }),
    ).toEqual({
      findings: [{ dependency, severity: "error", reason: "selected-unavailable" }],
      resolutions: [],
    });
  });

  it("conceals state for an unselected nonpublic target", () => {
    expect(
      evaluatePackDependencies({
        packVisibility: "public",
        dependencies: [dependency],
        snapshots: [{ ...snapshot, visibility: "private", lifecycleState: "unavailable" }],
      }),
    ).toEqual({
      findings: [{ dependency, severity: "error", reason: "not-public" }],
      resolutions: [],
    });
  });

  it("reports an absent dependency without inventing facts", () => {
    expect(
      evaluatePackDependencies({
        packVisibility: "public",
        dependencies: [dependency],
        snapshots: [],
      }),
    ).toEqual({
      findings: [{ dependency, severity: "error", reason: "missing" }],
      resolutions: [],
    });
  });

  it("does not revive an inactive dependency by selecting another publication", () => {
    const state = evaluatePackDependencies({
      packVisibility: "public",
      dependencies: [dependency],
      snapshots: [{ ...snapshot, lifecycleState: "unavailable" }],
      candidates: [candidate],
    });
    expect(state.findings).toMatchObject([
      { reason: "lifecycle-unavailable", lifecycle: "unavailable" },
    ]);
    expect(state.resolutions).toEqual([]);
  });

  it.each([
    { status: "unavailable", yanked: false, purged: false },
    { status: "available", yanked: true, purged: false },
    { status: "available", yanked: false, purged: true },
  ] as const)("excludes unavailable version facts %j even for exact requests", (version) => {
    const state = evaluatePackDependencies({
      packVisibility: "public",
      dependencies: [{ ...dependency, range: decodeVersionRangeSync("1.4.0") }],
      snapshots: [{ ...snapshot, versions: [{ version: decodeVersionSync("1.4.0"), ...version }] }],
    });
    expect(state.findings).toMatchObject([{ reason: "no-installable-version" }]);
    expect(state.resolutions).toEqual([]);
  });

  it("does not invent a version for a verified-existing participant", () => {
    const state = evaluatePackDependencies({
      packVisibility: "public",
      dependencies: [{ ...dependency, range: decodeVersionRangeSync("1.5.0") }],
      snapshots: [snapshot],
      candidates: [{ ...candidate, participation: "verified-existing" }],
    });
    expect(state.findings).toMatchObject([{ reason: "range-unsatisfied" }]);
    expect(state.resolutions).toEqual([]);
  });

  it("carries deprecation guidance while retaining a valid resolution", () => {
    const deprecation = {
      deprecatedAt: DateTime.makeUnsafe("2026-08-15T20:00:00.000Z"),
      reason: "superseded",
      message: "Use the maintained replacement.",
      replacement: { status: "available", fqn: "@acme/skills/review-next" },
    } as const;
    const state = evaluatePackDependencies({
      packVisibility: "public",
      dependencies: [dependency],
      snapshots: [{ ...snapshot, deprecation }],
    });
    expect(state.findings).toEqual([
      {
        dependency,
        severity: "warning",
        reason: "deprecated",
        effectiveVisibility: "public",
        lifecycle: "active",
        deprecation,
      },
    ]);
    expect(state.resolutions).toEqual([{ dependency, effectiveVersion: "1.4.0" }]);
  });

  it("orders findings by identity and constraint regardless of input order", () => {
    const second = { ...dependency, name: decodeExtensionNameSync("second") };
    const evaluate = (dependencies: ReadonlyArray<PackDependency>) =>
      evaluatePackDependencies({ packVisibility: "public", dependencies, snapshots: [] });
    expect(evaluate([second, dependency])).toEqual(evaluate([dependency, second]));
  });
});
