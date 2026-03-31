import { describe, expect, it } from "vitest";

import {
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
