import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";

import type { VersionEntryLike } from "./version-constraints.js";
import {
  isValidConstraint,
  parseVersionConstraint,
  resolveVersionWithConstraint,
  satisfiesConstraint,
  VersionConstraintSchema,
} from "./version-constraints.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeVersionEntryLike = (version: string): VersionEntryLike => ({
  version,
});

// -----------------------------------------------------------------------------
// VersionConstraintSchema
// -----------------------------------------------------------------------------

describe("VersionConstraintSchema", () => {
  const decode = Schema.decodeUnknownSync(VersionConstraintSchema);

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
// parseVersionConstraint
// -----------------------------------------------------------------------------

describe("parseVersionConstraint", () => {
  it("returns Option.none() for a bare namespaced name", () => {
    expect(parseVersionConstraint("@handle/name")).toEqual(Option.none());
  });

  it("extracts a caret constraint", () => {
    expect(parseVersionConstraint("@handle/name@^1.0.0")).toEqual(Option.some("^1.0.0"));
  });

  it("extracts an exact version", () => {
    expect(parseVersionConstraint("@handle/name@1.2.3")).toEqual(Option.some("1.2.3"));
  });

  it("extracts a tilde constraint", () => {
    expect(parseVersionConstraint("@handle/name@~1.2.0")).toEqual(Option.some("~1.2.0"));
  });

  it("extracts a range constraint", () => {
    expect(parseVersionConstraint("@handle/name@>=1.0.0 <2.0.0")).toEqual(
      Option.some(">=1.0.0 <2.0.0"),
    );
  });

  it("returns Option.none() for non-namespaced bare name", () => {
    expect(parseVersionConstraint("name")).toEqual(Option.none());
  });

  it("extracts constraint from non-namespaced name", () => {
    expect(parseVersionConstraint("name@^2.0.0")).toEqual(Option.some("^2.0.0"));
  });
});

// -----------------------------------------------------------------------------
// isValidConstraint
// -----------------------------------------------------------------------------

describe("isValidConstraint", () => {
  it("accepts caret range", () => {
    expect(isValidConstraint("^1.0.0")).toBe(true);
  });

  it("accepts exact version", () => {
    expect(isValidConstraint("1.2.3")).toBe(true);
  });

  it("rejects invalid string", () => {
    expect(isValidConstraint("not-a-version")).toBe(false);
  });

  it("accepts wildcard", () => {
    expect(isValidConstraint("*")).toBe(true);
  });

  it("accepts tilde range", () => {
    expect(isValidConstraint("~1.2.0")).toBe(true);
  });

  it("accepts hyphen range", () => {
    expect(isValidConstraint(">=1.0.0 <2.0.0")).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// satisfiesConstraint
// -----------------------------------------------------------------------------

describe("satisfiesConstraint", () => {
  it("returns true when version is within caret range", () => {
    expect(satisfiesConstraint("1.2.3", "^1.0.0")).toBe(true);
  });

  it("returns false when version is outside caret range", () => {
    expect(satisfiesConstraint("2.0.0", "^1.0.0")).toBe(false);
  });

  it("returns true for exact match", () => {
    expect(satisfiesConstraint("1.0.0", "1.0.0")).toBe(true);
  });

  it("returns false for exact mismatch", () => {
    expect(satisfiesConstraint("1.0.1", "1.0.0")).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// resolveVersionWithConstraint
// -----------------------------------------------------------------------------

describe("resolveVersionWithConstraint", () => {
  const versions: ReadonlyArray<VersionEntryLike> = [
    makeVersionEntryLike("2.0.0"),
    makeVersionEntryLike("1.3.0"),
    makeVersionEntryLike("1.2.0"),
    makeVersionEntryLike("1.0.0"),
  ];

  it("returns highest matching version for caret constraint", () => {
    const result = resolveVersionWithConstraint(versions, Option.some("^1.0.0"));
    expect(Option.isSome(result)).toBe(true);
    expect(Option.getOrThrow(result).version).toBe("1.3.0");
  });

  it("returns Option.none() when no version matches", () => {
    const result = resolveVersionWithConstraint(versions, Option.some("^5.0.0"));
    expect(Option.isNone(result)).toBe(true);
  });

  it("returns newest version when constraint is None", () => {
    const result = resolveVersionWithConstraint(versions, Option.none());
    expect(Option.isSome(result)).toBe(true);
    expect(Option.getOrThrow(result).version).toBe("2.0.0");
  });

  it("returns newest version when constraint is wildcard", () => {
    const result = resolveVersionWithConstraint(versions, Option.some("*"));
    expect(Option.isSome(result)).toBe(true);
    expect(Option.getOrThrow(result).version).toBe("2.0.0");
  });

  it("returns Option.none() for empty versions array", () => {
    const result = resolveVersionWithConstraint([], Option.some("^1.0.0"));
    expect(Option.isNone(result)).toBe(true);
  });
});
