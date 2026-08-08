import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";

import { resolveExistingVersionPolicy } from "./publish-flags.js";

describe("resolveExistingVersionPolicy", () => {
  it.each([
    ["authored", false, "verify"],
    ["all", false, "verify"],
    ["explicit", false, "error"],
    ["filtered-explicit", false, "error"],
    ["explicit", true, "verify"],
  ] as const)(
    "resolves %s selections with dependency=%s to %s",
    (mode, includedDependency, expected) => {
      expect(resolveExistingVersionPolicy(Option.none(), { mode, includedDependency })).toBe(
        expected,
      );
    },
  );

  it.each(["error", "verify"] as const)("honors the explicit %s override", (policy) => {
    expect(
      resolveExistingVersionPolicy(Option.some(policy), {
        mode: "authored",
        includedDependency: true,
      }),
    ).toBe(policy);
  });
});
