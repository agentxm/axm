import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";

import { make } from "./make.js";

describe("make", () => {
  it("creates a GitHubSource with required fields", () => {
    const result = make({ owner: "acme", repo: "widgets" });

    expect(result).toEqual({
      source: "github",
      owner: "acme",
      repo: "widgets",
      ref: Option.none(),
      subPath: Option.none(),
    });
  });

  it("wraps ref in Option.some when provided", () => {
    const result = make({ owner: "acme", repo: "widgets", ref: "v1.0.0" });

    expect(Option.getOrNull(result.ref)).toBe("v1.0.0");
  });

  it("wraps subPath in Option.some when provided", () => {
    const result = make({ owner: "acme", repo: "widgets", subPath: "src/lib" });

    expect(Option.getOrNull(result.subPath)).toBe("src/lib");
  });
});
