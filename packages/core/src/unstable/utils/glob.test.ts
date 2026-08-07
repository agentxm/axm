import { describe, expect, it } from "@effect/vitest";
import * as FastCheck from "effect/testing/FastCheck";

import { expandGlob, expandGlobs, isGlobPattern } from "./glob.js";

const PROPERTY_OPTIONS = { fastCheck: { numRuns: 500, seed: 0x41584d } };

const referenceMatches = (pattern: string, name: string): boolean => {
  const memo = new Map<string, boolean>();
  const visit = (patternIndex: number, nameIndex: number): boolean => {
    const key = `${patternIndex}:${nameIndex}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    if (patternIndex === pattern.length) return nameIndex === name.length;

    const token = pattern[patternIndex];
    const result =
      token === "*"
        ? visit(patternIndex + 1, nameIndex) ||
          (nameIndex < name.length && visit(patternIndex, nameIndex + 1))
        : nameIndex < name.length &&
          token === name[nameIndex] &&
          visit(patternIndex + 1, nameIndex + 1);
    memo.set(key, result);
    return result;
  };
  return visit(0, 0);
};

// ---------------------------------------------------------------------------
// expandGlob
// ---------------------------------------------------------------------------

describe("expandGlob", () => {
  it("matches wildcard prefix pattern", () => {
    expect(expandGlob("effect-*", ["effect-basics", "effect-stream", "testing-unit"])).toEqual([
      "effect-basics",
      "effect-stream",
    ]);
  });

  it("matches wildcard suffix pattern", () => {
    expect(expandGlob("*-testing", ["unit-testing", "e2e-testing", "effect-basics"])).toEqual([
      "unit-testing",
      "e2e-testing",
    ]);
  });

  it("matches wildcard in the middle", () => {
    expect(expandGlob("effect-*-basics", ["effect-ts-basics", "effect-basics", "testing"])).toEqual(
      ["effect-ts-basics"],
    );
  });

  it("matches all names with standalone wildcard", () => {
    expect(expandGlob("*", ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("matches exact literal name", () => {
    expect(expandGlob("effect-basics", ["effect-basics", "effect-stream"])).toEqual([
      "effect-basics",
    ]);
  });

  it("returns empty array when literal name is not found", () => {
    expect(expandGlob("nonexistent", ["effect-basics", "effect-stream"])).toEqual([]);
  });

  it("returns empty array when glob matches nothing", () => {
    expect(expandGlob("foo-*", ["bar-a", "baz-b"])).toEqual([]);
  });

  it("treats ? as a literal character", () => {
    expect(expandGlob("effect-?", ["effect-?", "effect-a"])).toEqual(["effect-?"]);
  });

  it("treats [] as literal characters", () => {
    expect(expandGlob("effect-[ab]", ["effect-[ab]", "effect-a"])).toEqual(["effect-[ab]"]);
  });

  it("matches case-sensitively", () => {
    expect(expandGlob("Effect-*", ["effect-basics", "Effect-Basics"])).toEqual(["Effect-Basics"]);
  });

  // Ignored-pattern semantics (full-name anchored, no partial matches)

  it("does not partially match substrings", () => {
    // "sample-*" should not match "my-sample-tool" (full-name anchoring)
    expect(expandGlob("sample-*", ["my-sample-tool", "sample-core"])).toEqual(["sample-core"]);
  });

  it("handles multiple * wildcards in one pattern", () => {
    expect(expandGlob("*-core-*", ["sample-core-utils", "sample-core", "core-utils"])).toEqual([
      "sample-core-utils",
    ]);
  });

  it("escapes regex special characters in pattern", () => {
    // Dots, plus signs etc. in patterns should be treated as literals
    expect(expandGlob("my.skill+v2", ["my.skill+v2", "myXskillXv2"])).toEqual(["my.skill+v2"]);
  });

  it("empty pattern matches only empty string", () => {
    expect(expandGlob("", ["", "anything"])).toEqual([""]);
  });

  it.prop(
    "agrees with a dynamic-programming wildcard oracle",
    {
      pattern: FastCheck.string({ maxLength: 20 }),
      names: FastCheck.array(FastCheck.string({ maxLength: 30 }), { maxLength: 20 }),
    },
    ({ pattern, names }) => {
      expect(expandGlob(pattern, names)).toEqual(
        names.filter((name) => referenceMatches(pattern, name)),
      );
    },
    PROPERTY_OPTIONS,
  );

  it("handles adversarial wildcard patterns without regex backtracking", () => {
    const pattern = `${"a*".repeat(14)}b`;
    const name = "a".repeat(61);
    expect(expandGlob(pattern, [name])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// expandGlobs
// ---------------------------------------------------------------------------

describe("expandGlobs", () => {
  it("multiple patterns produce union of matches", () => {
    const names = ["effect-basics", "effect-stream", "testing-unit", "testing-e2e"];
    const result = expandGlobs(["effect-*", "testing-*"], names);
    expect(result).toEqual(["effect-basics", "effect-stream", "testing-unit", "testing-e2e"]);
  });

  it("overlapping patterns deduplicate", () => {
    const names = ["effect-basics", "effect-stream", "testing-unit"];
    const result = expandGlobs(["effect-*", "*-basics"], names);
    expect(result).toEqual(["effect-basics", "effect-stream"]);
  });

  it("empty patterns return empty", () => {
    const names = ["effect-basics", "testing-unit"];
    const result = expandGlobs([], names);
    expect(result).toEqual([]);
  });

  it("preserves original name order", () => {
    const names = ["z-skill", "a-skill", "m-skill"];
    // Patterns match in reverse order, but result preserves `names` order
    const result = expandGlobs(["m-*", "a-*", "z-*"], names);
    expect(result).toEqual(["z-skill", "a-skill", "m-skill"]);
  });
});

// ---------------------------------------------------------------------------
// isGlobPattern
// ---------------------------------------------------------------------------

describe("isGlobPattern", () => {
  it("returns true for patterns containing *", () => {
    expect(isGlobPattern("effect-*")).toBe(true);
    expect(isGlobPattern("*")).toBe(true);
    expect(isGlobPattern("*-testing")).toBe(true);
  });

  it("returns false for non-glob inputs", () => {
    expect(isGlobPattern("effect-basics")).toBe(false);
    expect(isGlobPattern("my-skill")).toBe(false);
    expect(isGlobPattern("")).toBe(false);
  });
});
