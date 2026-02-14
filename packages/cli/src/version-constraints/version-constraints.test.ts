import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";

import type { VersionEntry } from "../registry/index.js";
import {
  isValidConstraint,
  parseVersionConstraint,
  resolveVersionWithConstraint,
  satisfiesConstraint,
} from "./version-constraints.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeVersionEntry = (version: string, agents: readonly string[] = []): VersionEntry => ({
  version,
  published: "2025-01-01T00:00:00Z",
  agents: [...agents],
  checksum: "sha256:0000",
});

// -----------------------------------------------------------------------------
// parseVersionConstraint
// -----------------------------------------------------------------------------

describe("parseVersionConstraint", () => {
  it("returns Option.none() for a bare scoped name", () => {
    expect(parseVersionConstraint("@scope/name")).toEqual(Option.none());
  });

  it("extracts a caret constraint", () => {
    expect(parseVersionConstraint("@scope/name@^1.0.0")).toEqual(Option.some("^1.0.0"));
  });

  it("extracts an exact version", () => {
    expect(parseVersionConstraint("@scope/name@1.2.3")).toEqual(Option.some("1.2.3"));
  });

  it("extracts a tilde constraint", () => {
    expect(parseVersionConstraint("@scope/name@~1.2.0")).toEqual(Option.some("~1.2.0"));
  });

  it("extracts a range constraint", () => {
    expect(parseVersionConstraint("@scope/name@>=1.0.0 <2.0.0")).toEqual(
      Option.some(">=1.0.0 <2.0.0"),
    );
  });

  it("returns Option.none() for unscoped bare name", () => {
    expect(parseVersionConstraint("name")).toEqual(Option.none());
  });

  it("extracts constraint from unscoped name", () => {
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
  const versions: ReadonlyArray<VersionEntry> = [
    makeVersionEntry("2.0.0"),
    makeVersionEntry("1.3.0"),
    makeVersionEntry("1.2.0"),
    makeVersionEntry("1.0.0"),
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

  it("applies agent filter alongside constraint", () => {
    const versionsWithAgents: ReadonlyArray<VersionEntry> = [
      makeVersionEntry("1.3.0", ["windsurf"]),
      makeVersionEntry("1.2.0", ["claude-code"]),
      makeVersionEntry("1.0.0", ["claude-code"]),
    ];

    const agentFilter = (v: VersionEntry): boolean => v.agents.includes("claude-code");
    const result = resolveVersionWithConstraint(
      versionsWithAgents,
      Option.some("^1.0.0"),
      agentFilter,
    );
    expect(Option.isSome(result)).toBe(true);
    expect(Option.getOrThrow(result).version).toBe("1.2.0");
  });

  it("returns Option.none() when agent filter rejects all matches", () => {
    const versionsWithAgents: ReadonlyArray<VersionEntry> = [
      makeVersionEntry("1.3.0", ["windsurf"]),
      makeVersionEntry("1.2.0", ["windsurf"]),
    ];

    const agentFilter = (v: VersionEntry): boolean => v.agents.includes("claude-code");
    const result = resolveVersionWithConstraint(
      versionsWithAgents,
      Option.some("^1.0.0"),
      agentFilter,
    );
    expect(Option.isNone(result)).toBe(true);
  });

  it("returns Option.none() for empty versions array", () => {
    const result = resolveVersionWithConstraint([], Option.some("^1.0.0"));
    expect(Option.isNone(result)).toBe(true);
  });
});
