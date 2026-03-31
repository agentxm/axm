import { describe, expect, it } from "vitest";

import {
  previewVersionBump,
  releaseTagFromVersion,
  releaseVersionFromTag,
  validateReleaseTag,
} from "./release-shared.js";

describe("release tag helpers", () => {
  it("accepts prerelease and build metadata tags", () => {
    const tag = "cli-v1.2.3-beta.1+build.7";

    expect(validateReleaseTag(tag)).toBe(tag);
    expect(releaseVersionFromTag(tag)).toBe("1.2.3-beta.1+build.7");
    expect(releaseTagFromVersion("1.2.3-beta.1+build.7")).toBe(tag);
  });
});

describe("previewVersionBump", () => {
  it("matches npm version for stable releases", () => {
    expect(previewVersionBump("1.2.3", "minor")).toBe("1.3.0");
  });

  it("matches npm version for prerelease patch bumps", () => {
    expect(previewVersionBump("1.2.3-beta.1", "patch")).toBe("1.2.3");
  });
});
