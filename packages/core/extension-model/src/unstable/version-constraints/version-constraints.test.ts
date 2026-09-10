import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as FastCheck from "effect/testing/FastCheck";
import * as semver from "semver";
import { describe, expect, it } from "@effect/vitest";
import { exactVersion, versionRange } from "../test-helpers.js";

import type { VersionEntryLike } from "./version-constraints.js";
import {
  intersectVersionConstraints,
  isValidVersionRange,
  parseVersionRange,
  resolveVersionInRange,
  versionSatisfiesRange,
  VersionRangeSchema,
} from "./version-constraints.js";

describe("intersectVersionConstraints", () => {
  it("returns one satisfiable range for every contributor", () => {
    const intersection = intersectVersionConstraints([">=1.0.0", "^1.2.0"]);
    expect(intersection).toBeDefined();
    expect(semver.satisfies("1.5.0", intersection ?? "<0.0.0")).toBe(true);
    expect(semver.satisfies("2.0.0", intersection ?? "<0.0.0")).toBe(false);
  });

  it("rejects a three-way empty intersection even when every pair intersects", () => {
    expect(
      intersectVersionConstraints(["^1.0.0 || ^3.0.0", "^1.0.0 || ^2.0.0", "^2.0.0 || ^3.0.0"]),
    ).toBeUndefined();
  });
});

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeVersionEntryLike = (version: string): VersionEntryLike => ({
  version: exactVersion(version),
});

const PROPERTY_OPTIONS = { fastCheck: { numRuns: 250, seed: 0x41584d } };
const versionArbitrary = FastCheck.record({
  major: FastCheck.integer({ min: 0, max: 8 }),
  minor: FastCheck.integer({ min: 0, max: 12 }),
  patch: FastCheck.integer({ min: 0, max: 20 }),
}).map(({ major, minor, patch }) => `${major}.${minor}.${patch}`);

// -----------------------------------------------------------------------------
// VersionRangeSchema
// -----------------------------------------------------------------------------

describe("VersionRangeSchema", () => {
  const decode = Schema.decodeUnknownSync(VersionRangeSchema);

  it("accepts exact versions and ranges", () => {
    expect(decode("1.2.3")).toBe("1.2.3");
    expect(decode("^1.0.0")).toBe("^1.0.0");
    expect(decode(">=1.0.0 <2.0.0")).toBe(">=1.0.0 <2.0.0");
    expect(decode("1.0.0+build.1")).toBe("1.0.0+build.1");
  });

  it.prop(
    "accepts valid versions with build metadata",
    { version: versionArbitrary, build: FastCheck.integer({ min: 0, max: 1_000_000 }) },
    ({ version, build }) => {
      const candidate = `${version}+build.${build}`;
      expect(semver.validRange(candidate)).not.toBeNull();
      expect(decode(candidate)).toBe(candidate);
    },
    PROPERTY_OPTIONS,
  );

  it("rejects invalid constraints", () => {
    expect(() => decode("latest")).toThrow();
  });
});

// -----------------------------------------------------------------------------
// parseVersionRange
// -----------------------------------------------------------------------------

describe("parseVersionRange", () => {
  it("returns Option.none() for a bare namespaced name", () => {
    expect(parseVersionRange("@handle/name")).toEqual(Option.none());
  });

  it("extracts a caret constraint", () => {
    expect(parseVersionRange("@handle/name@^1.0.0")).toEqual(Option.some("^1.0.0"));
  });

  it("extracts an exact version", () => {
    expect(parseVersionRange("@handle/name@1.2.3")).toEqual(Option.some("1.2.3"));
  });

  it("extracts a tilde constraint", () => {
    expect(parseVersionRange("@handle/name@~1.2.0")).toEqual(Option.some("~1.2.0"));
  });

  it("extracts a range constraint", () => {
    expect(parseVersionRange("@handle/name@>=1.0.0 <2.0.0")).toEqual(Option.some(">=1.0.0 <2.0.0"));
  });

  it("returns Option.none() for non-namespaced bare name", () => {
    expect(parseVersionRange("name")).toEqual(Option.none());
  });

  it("extracts constraint from non-namespaced name", () => {
    expect(parseVersionRange("name@^2.0.0")).toEqual(Option.some("^2.0.0"));
  });
});

// -----------------------------------------------------------------------------
// isValidVersionRange
// -----------------------------------------------------------------------------

describe("isValidVersionRange", () => {
  it("accepts caret range", () => {
    expect(isValidVersionRange("^1.0.0")).toBe(true);
  });

  it("accepts exact version", () => {
    expect(isValidVersionRange("1.2.3")).toBe(true);
  });

  it("rejects invalid string", () => {
    expect(isValidVersionRange("not-a-version")).toBe(false);
  });

  it("accepts wildcard", () => {
    expect(isValidVersionRange("*")).toBe(true);
  });

  it("accepts tilde range", () => {
    expect(isValidVersionRange("~1.2.0")).toBe(true);
  });

  it("accepts hyphen range", () => {
    expect(isValidVersionRange(">=1.0.0 <2.0.0")).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// versionSatisfiesRange
// -----------------------------------------------------------------------------

describe("versionSatisfiesRange", () => {
  it("returns true when version is within caret range", () => {
    expect(versionSatisfiesRange(exactVersion("1.2.3"), versionRange("^1.0.0"))).toBe(true);
  });

  it("returns false when version is outside caret range", () => {
    expect(versionSatisfiesRange(exactVersion("2.0.0"), versionRange("^1.0.0"))).toBe(false);
  });

  it("returns true for exact match", () => {
    expect(versionSatisfiesRange(exactVersion("1.0.0"), versionRange("1.0.0"))).toBe(true);
  });

  it("returns false for exact mismatch", () => {
    expect(versionSatisfiesRange(exactVersion("1.0.1"), versionRange("1.0.0"))).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// resolveVersionInRange
// -----------------------------------------------------------------------------

describe("resolveVersionInRange", () => {
  const versions: ReadonlyArray<VersionEntryLike> = [
    makeVersionEntryLike("2.0.0"),
    makeVersionEntryLike("1.3.0"),
    makeVersionEntryLike("1.2.0"),
    makeVersionEntryLike("1.0.0"),
  ];

  it("returns highest matching version for caret constraint", () => {
    const result = resolveVersionInRange(versions, Option.some("^1.0.0"));
    expect(Option.isSome(result)).toBe(true);
    expect(Option.getOrThrow(result).version).toBe("1.3.0");
  });

  it("returns Option.none() when no version matches", () => {
    const result = resolveVersionInRange(versions, Option.some("^5.0.0"));
    expect(Option.isNone(result)).toBe(true);
  });

  it("returns newest version when constraint is None", () => {
    const result = resolveVersionInRange(versions, Option.none());
    expect(Option.isSome(result)).toBe(true);
    expect(Option.getOrThrow(result).version).toBe("2.0.0");
  });

  it("returns newest version when constraint is wildcard", () => {
    const result = resolveVersionInRange(versions, Option.some("*"));
    expect(Option.isSome(result)).toBe(true);
    expect(Option.getOrThrow(result).version).toBe("2.0.0");
  });

  it("returns Option.none() for empty versions array", () => {
    const result = resolveVersionInRange([], Option.some("^1.0.0"));
    expect(Option.isNone(result)).toBe(true);
  });

  it("breaks equal-precedence build metadata ties deterministically", () => {
    const lower = makeVersionEntryLike("1.0.0+build.1");
    const higher = makeVersionEntryLike("1.0.0+build.2");
    const forward = resolveVersionInRange([lower, higher], Option.some("*"));
    const reverse = resolveVersionInRange([higher, lower], Option.some("*"));

    expect(Option.getOrThrow(forward).version).toBe("1.0.0+build.2");
    expect(Option.getOrThrow(reverse).version).toBe("1.0.0+build.2");
  });

  it.prop(
    "agrees with semver.maxSatisfying regardless of publication order",
    {
      versions: FastCheck.uniqueArray(versionArbitrary, {
        minLength: 1,
        maxLength: 30,
        selector: (version) => version,
      }),
      range: FastCheck.constantFrom("*", "^1.0.0", "^2.0.0", ">=1.0.0 <5.0.0", "~3.2.0"),
    },
    ({ versions: generatedVersions, range }) => {
      const expected = semver.maxSatisfying(generatedVersions, range);
      const actual = resolveVersionInRange(
        generatedVersions.map(makeVersionEntryLike),
        Option.some(range),
      );
      expect(Option.getOrNull(actual)?.version ?? null).toBe(expected);
    },
    PROPERTY_OPTIONS,
  );
});
