import { describe, expect, it } from "vitest";

import { typecheckDependencies } from "./typecheck-plugin.js";

describe("typecheck target inference", () => {
  it("typechecks against a project's own build and its dependencies' typechecks", () => {
    expect(typecheckDependencies(true)).toEqual(["build", "^typecheck"]);
    expect(typecheckDependencies(false)).toEqual(["^typecheck"]);
  });
});
