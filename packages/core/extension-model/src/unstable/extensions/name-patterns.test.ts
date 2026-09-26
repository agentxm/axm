import { describe, expect, it } from "vitest";
import { fc as FastCheck, it as fastCheckIt } from "@fast-check/vitest";
import { expandGlob, expandGlobs, isGlobPattern, matchesPattern } from "./name-patterns.js";

const PROPERTY_OPTIONS = { numRuns: 500, seed: 0x41584d };

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

describe("extension name patterns", () => {
  it("matches a complete name with only star as a wildcard", () => {
    expect(matchesPattern("inspect-*", "inspect-one")).toBe(true);
    expect(matchesPattern("inspect-*", "pre-inspect-one")).toBe(false);
    expect(matchesPattern("inspect-?", "inspect-?")).toBe(true);
    expect(matchesPattern("inspect-?", "inspect-a")).toBe(false);
    expect(matchesPattern("Inspect-*", "inspect-one")).toBe(false);
  });

  it("matches only the star wildcard; other pattern punctuation stays literal", () => {
    const names = ["inspect-one", "inspect-two", "inspect-?", "inspect-[ab]", "inspect-(x)"];
    expect(expandGlob("inspect-?", names)).toEqual(["inspect-?"]);
    expect(expandGlob("inspect-[ab]", names)).toEqual(["inspect-[ab]"]);
    expect(expandGlob("inspect-(x)", names)).toEqual(["inspect-(x)"]);
    expect(expandGlob("inspect-*", names)).toEqual(names);
  });
  it("keeps matching case sensitive and anchors both ends", () => {
    expect(expandGlob("inspect", ["inspect", "Inspect", "inspect-more", "pre-inspect"])).toEqual([
      "inspect",
    ]);
  });
  it("supports repeated and empty star matches", () => {
    expect(expandGlob("a**b*", ["ab", "a-b", "ab-more", "a"])).toEqual(["ab", "a-b", "ab-more"]);
  });
  it("preserves name order while taking the union of requested patterns", () => {
    expect(expandGlobs(["second", "*"], ["first", "second"])).toEqual(["first", "second"]);
  });
  fastCheckIt.prop(
    {
      pattern: FastCheck.string({ maxLength: 20 }),
      names: FastCheck.array(FastCheck.string({ maxLength: 30 }), { maxLength: 20 }),
    },
    PROPERTY_OPTIONS,
  )("agrees with a dynamic-programming wildcard oracle", ({ pattern, names }) => {
    expect(expandGlob(pattern, names)).toEqual(
      names.filter((name) => referenceMatches(pattern, name)),
    );
    for (const name of names) {
      expect(matchesPattern(pattern, name)).toBe(referenceMatches(pattern, name));
    }
  });

  it("handles adversarial wildcard patterns without regex backtracking", () => {
    const pattern = `${"a*".repeat(14)}b`;
    const name = "a".repeat(61);
    expect(expandGlob(pattern, [name])).toEqual([]);
  });
  it("recognizes the supported wildcard grammar", () => {
    expect(isGlobPattern("name*")).toBe(true);
    expect(isGlobPattern("name?")).toBe(false);
  });
});
