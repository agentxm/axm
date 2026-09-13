import { describe, expect, it } from "vitest";
import { expandGlob, expandGlobs, isGlobPattern } from "./name-patterns.js";

describe("extension name patterns", () => {
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
  it("recognizes the supported wildcard grammar", () => {
    expect(isGlobPattern("name*")).toBe(true);
    expect(isGlobPattern("name?")).toBe(false);
  });
});
