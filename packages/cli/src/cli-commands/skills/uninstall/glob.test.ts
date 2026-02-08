import { describe, expect, it } from "vitest";
import { expandGlob } from "./glob.js";

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
});
