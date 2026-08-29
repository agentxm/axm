import { describe, expect, it } from "vitest";

import { classifyCiChanges, selectCodeVerificationPaths } from "./classify-ci-changes.js";

describe("classifyCiChanges", () => {
  it("always requires formatting", () => {
    expect(classifyCiChanges([]).formatRequired).toBe(true);
  });

  it("classifies documentation without code work", () => {
    expect(classifyCiChanges(["contributing/guides/setup.md", "README.md"])).toMatchObject({
      code: false,
      documentation: true,
      image: false,
      workflow: false,
    });
  });

  it("classifies CI image inputs independently", () => {
    expect(
      classifyCiChanges(["containers/ci/Containerfile", ".github/workflows/ci-image-publish.yml"]),
    ).toMatchObject({
      code: false,
      image: true,
      workflow: true,
    });
  });

  it("classifies workflow-only changes without compiling code", () => {
    expect(classifyCiChanges([".github/workflows/ci.yml"])).toMatchObject({
      code: false,
      image: false,
      workflow: true,
    });
  });

  it("uses changed code paths as the verification signal", () => {
    expect(classifyCiChanges(["packages/cli/src/main.ts"])).toMatchObject({
      code: true,
    });
  });

  it("runs code verification for release and infrastructure inputs", () => {
    expect(classifyCiChanges(["scripts/release-publish.ts", "infra/example.ts"])).toMatchObject({
      code: true,
      releaseInfrastructure: true,
    });
  });

  it("selects only paths that require code verification", () => {
    expect(
      selectCodeVerificationPaths([
        "README.md",
        ".github/workflows/ci.yml",
        "containers/ci/Containerfile",
        "packages/cli/src/main.ts",
      ]),
    ).toEqual(["packages/cli/src/main.ts"]);
  });
});
