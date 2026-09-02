import { describe, expect, it } from "vitest";

import { typecheckDependencies } from "./typecheck-plugin.js";

describe("typecheck target inference", () => {
  it("builds shared test reporting before package Vitest configs are typechecked", () => {
    expect(typecheckDependencies(true)).toEqual([
      "axm:build-test-reporting",
      "build",
      "^typecheck",
    ]);
    expect(typecheckDependencies(false)).toEqual(["axm:build-test-reporting", "^typecheck"]);
  });
});
