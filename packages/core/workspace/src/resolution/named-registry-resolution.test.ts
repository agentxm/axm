/**
 * Named Registry target decisions under the minimum-release-age policy.
 */

import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { ReleaseAgeExcludePatternSchema } from "@agentxm/extension-model/unstable/extensions";
import type {
  ExtensionIndex,
  VersionEntry,
} from "@agentxm/registry-protocol/unstable/registry/schema";
import {
  decideNamedRegistryVersion,
  namedRegistryCandidates,
} from "./named-registry-resolution.js";
import { exactVersion, extensionName, handle } from "./test-helpers.js";

const makeVersionEntry = (overrides?: {
  readonly version?: string;
  readonly published?: string;
}): VersionEntry => ({
  version: exactVersion(overrides?.version ?? "1.0.0"),
  published: DateTime.makeUnsafe(overrides?.published ?? "2025-01-01T00:00:00Z"),
  integrity: "sha512-0000",
});

const makeIndex = (versions: ReadonlyArray<VersionEntry>): ExtensionIndex => ({
  owner: handle("@test"),
  type: "skill",
  name: extensionName("my-skill"),
  publisherBindingId: "hbnd_test",
  deprecation: null,
  versions,
});

const evaluation = {
  minimumReleaseAge: Duration.hours(24),
  evaluatedAt: DateTime.makeUnsafe("2025-01-03T00:00:00Z"),
  mode: "enforce" as const,
};
const options = {
  name: "my-skill",
  type: "skill" as const,
  owner: handle("@test"),
  versionRange: Option.none<string>(),
  releaseAgeEvaluation: evaluation,
};
const heldEvidence = {
  version: "2.0.0",
  publishedAt: "2025-01-02T12:00:00.000Z",
  eligibleAt: "2025-01-03T12:00:00.000Z",
  minimumReleaseAgeSeconds: 86_400,
};
const excludePattern = (pattern: string) =>
  Schema.decodeUnknownSync(ReleaseAgeExcludePatternSchema)(pattern);

describe("decideNamedRegistryVersion", () => {
  it("distinguishes a visible unsatisfied range", () => {
    const decision = decideNamedRegistryVersion(makeIndex([makeVersionEntry()]), {
      ...options,
      versionRange: Option.some("^2.0.0"),
    });
    expect(decision).toEqual({ kind: "version_unsatisfied", requestedRange: "^2.0.0" });
  });

  it("returns not_found when an exact requested release is absent", () => {
    const decision = decideNamedRegistryVersion(makeIndex([makeVersionEntry()]), {
      ...options,
      versionRange: Option.some("2.0.0"),
    });
    expect(decision).toEqual({ kind: "not_found" });
  });

  it("returns a policy-held candidate with absolute eligibility evidence", () => {
    const decision = decideNamedRegistryVersion(
      makeIndex([makeVersionEntry({ version: "2.0.0", published: "2025-01-02T12:00:00Z" })]),
      { ...options, versionRange: Option.some("2.0.0") },
    );
    expect(decision).toEqual({
      kind: "policy_held",
      requestedRange: "2.0.0",
      candidate: heldEvidence,
    });
  });

  it("selects an under-age release excluded by authoritative Registry identity", () => {
    const decision = decideNamedRegistryVersion(
      makeIndex([makeVersionEntry({ version: "2.0.0", published: "2025-01-02T12:00:00Z" })]),
      {
        ...options,
        releaseAgeEvaluation: {
          ...evaluation,
          mode: "ignore",
          exclude: [{ pattern: excludePattern("@test/skills/*"), scope: "project" }],
        },
      },
    );
    expect(decision).toEqual({
      kind: "exempted",
      version: "2.0.0",
      bypassed: heldEvidence,
      exemption: { bypassCause: "exclude", exemptionScope: "project" },
    });
  });

  it("does not emit bypass evidence when an excluded release is already mature", () => {
    const decision = decideNamedRegistryVersion(makeIndex([makeVersionEntry()]), {
      ...options,
      releaseAgeEvaluation: {
        ...evaluation,
        exclude: [{ pattern: excludePattern("@test/*"), scope: "user" }],
      },
    });
    expect(decision).toEqual({ kind: "selected", version: "1.0.0" });
  });

  it("selects the newest eligible version and discloses a newer held candidate", () => {
    const decision = decideNamedRegistryVersion(
      makeIndex([
        makeVersionEntry({ version: "1.0.0" }),
        makeVersionEntry({ version: "2.0.0", published: "2025-01-02T12:00:00Z" }),
      ]),
      options,
    );
    expect(decision).toEqual({ kind: "selected", version: "1.0.0", newerHeld: heldEvidence });
  });

  it("preserves an accepted under-age version from the same publisher", () => {
    const decision = decideNamedRegistryVersion(
      makeIndex([
        makeVersionEntry({ version: "1.0.0" }),
        makeVersionEntry({ version: "1.5.0", published: "2025-01-02T12:00:00Z" }),
        makeVersionEntry({ version: "2.0.0", published: "2025-01-02T18:00:00Z" }),
      ]),
      { ...options, accepted: { version: "1.5.0", publisherBindingId: "hbnd_test" } },
    );
    expect(decision.kind).toBe("selected");
    if (decision.kind !== "selected") return;
    expect(decision.version).toBe("1.5.0");
    expect(decision.newerHeld?.version).toBe("2.0.0");
  });

  it("does not trust an accepted version from a different publisher", () => {
    const decision = decideNamedRegistryVersion(
      makeIndex([
        makeVersionEntry({ version: "1.0.0" }),
        makeVersionEntry({ version: "1.5.0", published: "2025-01-02T12:00:00Z" }),
      ]),
      { ...options, accepted: { version: "1.5.0", publisherBindingId: "hbnd_other" } },
    );
    expect(decision.kind).toBe("selected");
    if (decision.kind !== "selected") return;
    expect(decision.version).toBe("1.0.0");
  });
});

describe("namedRegistryCandidates", () => {
  const index = makeIndex([
    makeVersionEntry({ version: "0.5.0" }),
    makeVersionEntry({ version: "1.0.0" }),
    makeVersionEntry({ version: "2.0.0", published: "2025-01-02T12:00:00Z" }),
  ]);

  it("lists eligible candidates newest first, then the held candidates", () => {
    expect(namedRegistryCandidates(index, options)).toEqual([
      { version: "1.0.0", outcome: { kind: "selected" } },
      { version: "0.5.0", outcome: { kind: "selected" } },
      { version: "2.0.0", outcome: { kind: "held", candidate: heldEvidence } },
    ]);
  });

  it("keeps an accepted under-age version selectable without exempting it", () => {
    const candidates = namedRegistryCandidates(index, {
      ...options,
      accepted: { version: "2.0.0", publisherBindingId: "hbnd_test" },
    });
    expect(candidates.map((candidate) => [candidate.version, candidate.outcome.kind])).toEqual([
      ["2.0.0", "selected"],
      ["1.0.0", "selected"],
      ["0.5.0", "selected"],
      ["2.0.0", "held"],
    ]);
  });

  it("marks under-age candidates as exempted and holds nothing under an exemption", () => {
    const candidates = namedRegistryCandidates(index, {
      ...options,
      releaseAgeEvaluation: { ...evaluation, mode: "ignore" },
    });
    expect(candidates).toEqual([
      {
        version: "2.0.0",
        outcome: {
          kind: "exempted",
          bypassed: heldEvidence,
          exemption: { bypassCause: "ignore-flag" },
        },
      },
      { version: "1.0.0", outcome: { kind: "selected" } },
      { version: "0.5.0", outcome: { kind: "selected" } },
    ]);
  });

  it("restricts candidates to an exact request, including yanked releases", () => {
    const candidates = namedRegistryCandidates(index, {
      ...options,
      versionRange: Option.some("1.0.0"),
    });
    expect(candidates).toEqual([{ version: "1.0.0", outcome: { kind: "selected" } }]);
  });
});
