import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import { exactVersion, versionRange } from "../test-helpers.js";

import type { VersionEntryLike } from "./version-constraints.js";
import {
  isValidVersionRange,
  parseVersionRange,
  resolveVersionInRange,
  versionSatisfiesRange,
  VersionRangeSchema,
} from "./version-constraints.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeVersionEntryLike = (version: string): VersionEntryLike => ({
  version: exactVersion(version),
});

// -----------------------------------------------------------------------------
// VersionRangeSchema
// -----------------------------------------------------------------------------

describe("VersionRangeSchema", () => {
  const decode = Schema.decodeUnknownSync(VersionRangeSchema);

  it("accepts exact versions and ranges", () => {
    expect(decode("1.2.3")).toBe("1.2.3");
    expect(decode("^1.0.0")).toBe("^1.0.0");
    expect(decode(">=1.0.0 <2.0.0")).toBe(">=1.0.0 <2.0.0");
  });

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
});
