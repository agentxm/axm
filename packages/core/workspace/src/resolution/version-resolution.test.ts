/**
 * Tests for version selection under the minimum-release-age policy.
 */

import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";

import type { VersionEntry } from "@agentxm/registry-protocol/unstable/registry/schema";
import { exactVersion } from "./test-helpers.js";
import {
  filterMatureVersions,
  formatMinimumReleaseAgeSeconds,
  isVersionEntryMature,
  normalizeReleaseAgeRecords,
  parseMinimumReleaseAge,
} from "./release-age-policy.js";
import {
  resolveVersionEntryForReleaseAge,
  resolveVersionEntryWithReleaseAge,
} from "./version-resolution.js";

const makeVersionEntry = (overrides?: Partial<VersionEntry>): VersionEntry => ({
  version: exactVersion("1.0.0"),
  published: DateTime.makeUnsafe("2025-01-01T00:00:00Z"),
  integrity: "sha512-AAAA==",
  ...overrides,
});

describe("minimum release age", () => {
  const oneDay = Duration.hours(24);
  const now = DateTime.makeUnsafe("2025-01-03T00:00:00Z");
  const heldVersion = makeVersionEntry({
    version: exactVersion("1.3.0"),
    published: DateTime.makeUnsafe("2025-01-02T23:00:00Z"),
  });
  const matureVersion = makeVersionEntry({
    version: exactVersion("1.2.0"),
    published: DateTime.makeUnsafe("2025-01-01T00:00:00Z"),
  });
  const mixedMaturityVersions = [heldVersion, matureVersion];

  it("parses duration strings", () => {
    expect(Duration.toMillis(Option.getOrThrow(parseMinimumReleaseAge("24h")))).toBe(86_400_000);
    expect(Duration.toMillis(Option.getOrThrow(parseMinimumReleaseAge("1440m")))).toBe(86_400_000);
    expect(Duration.toMillis(Option.getOrThrow(parseMinimumReleaseAge("0s")))).toBe(0);
    expect(Option.isNone(parseMinimumReleaseAge("tomorrow"))).toBe(true);
  });

  it("renders release-age windows in the units the setting accepts", () => {
    expect(formatMinimumReleaseAgeSeconds(86_400)).toBe("24h");
    expect(formatMinimumReleaseAgeSeconds(172_800)).toBe("2d");
    expect(formatMinimumReleaseAgeSeconds(604_800)).toBe("7d");
    expect(formatMinimumReleaseAgeSeconds(129_600)).toBe("36h");
    expect(formatMinimumReleaseAgeSeconds(900)).toBe("15m");
    expect(formatMinimumReleaseAgeSeconds(90)).toBe("90s");
    expect(formatMinimumReleaseAgeSeconds(0)).toBe("0s");
  });

  it.effect("filters versions newer than the configured age", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(DateTime.toEpochMillis(now));

      const mature = yield* filterMatureVersions(mixedMaturityVersions, oneDay);

      expect(mature.map((entry) => entry.version)).toEqual(["1.2.0"]);
    }),
  );

  it.effect("treats a version published exactly minimumAge ago as mature", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(DateTime.toEpochMillis(now));
      const entry = makeVersionEntry({
        version: exactVersion("1.4.0"),
        published: DateTime.makeUnsafe("2025-01-02T00:00:00Z"),
      });

      expect(yield* isVersionEntryMature(entry, oneDay)).toBe(true);
    }),
  );

  it.effect("treats every version as mature when minimumAge is zero", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(DateTime.toEpochMillis(now));

      const mature = yield* filterMatureVersions(mixedMaturityVersions, Duration.zero);

      expect(mature.map((entry) => entry.version)).toEqual(["1.3.0", "1.2.0"]);
    }),
  );

  it.effect("resolves the newest mature version when release age is enforced", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(DateTime.toEpochMillis(now));

      const result = yield* resolveVersionEntryWithReleaseAge(
        mixedMaturityVersions,
        Option.none(),
        Option.some(oneDay),
      );

      expect(Option.getOrThrow(result).version).toBe("1.2.0");
    }),
  );

  it("classifies a newer held version while selecting the newest eligible version", () => {
    const result = resolveVersionEntryForReleaseAge(mixedMaturityVersions, Option.none(), {
      minimumReleaseAge: oneDay,
      evaluatedAt: now,
      mode: "enforce",
    });

    expect(result).toEqual({
      kind: "selected",
      version: matureVersion,
      newerHeld: {
        version: "1.3.0",
        publishedAt: "2025-01-02T23:00:00.000Z",
        eligibleAt: "2025-01-03T23:00:00.000Z",
        minimumReleaseAgeSeconds: 86_400,
      },
    });
  });

  it("keeps an accepted under-age version above the eligible version floor", () => {
    const acceptedVersion = makeVersionEntry({
      version: exactVersion("1.2.5"),
      published: DateTime.makeUnsafe("2025-01-02T12:00:00Z"),
    });
    const result = resolveVersionEntryForReleaseAge(
      [heldVersion, acceptedVersion, matureVersion],
      Option.none(),
      {
        minimumReleaseAge: oneDay,
        evaluatedAt: now,
        mode: "enforce",
      },
      undefined,
      "1.2.5",
    );

    expect(result).toEqual({
      kind: "selected",
      version: acceptedVersion,
      newerHeld: {
        version: "1.3.0",
        publishedAt: "2025-01-02T23:00:00.000Z",
        eligibleAt: "2025-01-03T23:00:00.000Z",
        minimumReleaseAgeSeconds: 86_400,
      },
    });
  });

  it("keeps the accepted candidate itself when it is still under age", () => {
    const result = resolveVersionEntryForReleaseAge(
      [heldVersion, matureVersion],
      Option.none(),
      {
        minimumReleaseAge: oneDay,
        evaluatedAt: now,
        mode: "enforce",
      },
      undefined,
      "1.3.0",
    );

    expect(result).toEqual({
      kind: "selected",
      version: heldVersion,
      newerHeld: {
        version: "1.3.0",
        publishedAt: "2025-01-02T23:00:00.000Z",
        eligibleAt: "2025-01-03T23:00:00.000Z",
        minimumReleaseAgeSeconds: 86_400,
      },
    });
  });

  it("allows an explicit lower exact version outside the accepted floor", () => {
    const result = resolveVersionEntryForReleaseAge(
      [heldVersion, matureVersion],
      Option.some("1.2.0"),
      {
        minimumReleaseAge: oneDay,
        evaluatedAt: now,
        mode: "enforce",
      },
      undefined,
      "1.3.0",
    );

    expect(result).toEqual({
      kind: "selected",
      version: matureVersion,
    });
  });

  it("classifies an otherwise matching version as policy held", () => {
    const result = resolveVersionEntryForReleaseAge([heldVersion], Option.none(), {
      minimumReleaseAge: oneDay,
      evaluatedAt: now,
      mode: "enforce",
    });

    expect(result).toEqual({
      kind: "policy_held",
      candidate: {
        version: "1.3.0",
        publishedAt: "2025-01-02T23:00:00.000Z",
        eligibleAt: "2025-01-03T23:00:00.000Z",
        minimumReleaseAgeSeconds: 86_400,
      },
    });
  });

  it("selects and records an under-age version when release age is explicitly ignored", () => {
    const result = resolveVersionEntryForReleaseAge(
      [heldVersion],
      Option.none(),
      {
        minimumReleaseAge: oneDay,
        evaluatedAt: now,
        mode: "ignore",
      },
      { bypassCause: "ignore-flag" },
    );

    expect(result).toEqual({
      kind: "exempted",
      version: heldVersion,
      exemption: { bypassCause: "ignore-flag" },
      bypassed: {
        version: "1.3.0",
        publishedAt: "2025-01-02T23:00:00.000Z",
        eligibleAt: "2025-01-03T23:00:00.000Z",
        minimumReleaseAgeSeconds: 86_400,
      },
    });
  });

  it("keeps same-target bypass records with distinct causes", () => {
    const record = {
      reason: "minimum-release-age" as const,
      target: "@acme/skills/review",
      dependencyPath: ["@acme/skills/review"],
      candidateVersion: "2.0.0",
      publishedAt: "2025-01-02T23:00:00.000Z",
      eligibleAt: "2025-01-03T23:00:00.000Z",
      minimumReleaseAgeSeconds: 86_400,
    };

    expect(
      normalizeReleaseAgeRecords([
        { ...record, bypassCause: "ignore-flag" },
        { ...record, bypassCause: "exclude", exemptionScope: "project" },
      ]),
    ).toHaveLength(2);
  });

  it("distinguishes a visible extension with no matching version", () => {
    const result = resolveVersionEntryForReleaseAge(mixedMaturityVersions, Option.some("^2.0.0"), {
      minimumReleaseAge: oneDay,
      evaluatedAt: now,
      mode: "enforce",
    });

    expect(result).toEqual({ kind: "version_unsatisfied" });
  });

  it("uses the supplied inclusive eligibility timestamp instead of reading the clock", () => {
    const entry = makeVersionEntry({
      version: exactVersion("1.4.0"),
      published: DateTime.makeUnsafe("2025-01-02T00:00:00Z"),
    });
    const result = resolveVersionEntryForReleaseAge([entry], Option.none(), {
      minimumReleaseAge: oneDay,
      evaluatedAt: now,
      mode: "enforce",
    });

    expect(result).toEqual({ kind: "selected", version: entry });
  });
});
