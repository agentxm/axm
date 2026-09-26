import { describe, expect, it } from "vitest";

import {
  isReleaseLikeSubject,
  parseReleaseCommitSubject,
  readVersionFromJson,
  releaseTagFromVersion,
  releaseVersionFromTag,
  requireFullSha,
  requireStableVersion,
  validateReleaseTag,
} from "./release-identity.js";

describe("release identity", () => {
  it("round-trips a tag with prerelease and build metadata", () => {
    const tag = "cli-v1.2.3-beta.1+build.7";
    expect(validateReleaseTag(tag)).toBe(tag);
    expect(releaseVersionFromTag(tag)).toBe("1.2.3-beta.1+build.7");
    expect(releaseTagFromVersion("1.2.3-beta.1+build.7")).toBe(tag);
  });

  it("recognizes exact prepared and squash-merged release subjects", () => {
    expect(parseReleaseCommitSubject("release: cli-v0.27.3")).toEqual({
      tag: "cli-v0.27.3",
      version: "0.27.3",
    });
    expect(parseReleaseCommitSubject("release: cli-v0.27.3 (#188)")).toEqual({
      tag: "cli-v0.27.3",
      version: "0.27.3",
    });
    expect(parseReleaseCommitSubject("release: cli-v0.27.30 (#188)")).toEqual({
      tag: "cli-v0.27.30",
      version: "0.27.30",
    });
    expect(parseReleaseCommitSubject("release: cli-v1.2.3-beta.1+build.7")).toEqual({
      tag: "cli-v1.2.3-beta.1+build.7",
      version: "1.2.3-beta.1+build.7",
    });
    expect(parseReleaseCommitSubject("release: cli-v0.27.3 follow-up")).toBeUndefined();
    expect(parseReleaseCommitSubject("release: cli-v0.27.3 (#abc)")).toBeUndefined();
    expect(isReleaseLikeSubject("release: cli-v0.27.3 follow-up")).toBe(true);
    expect(isReleaseLikeSubject("fix: release notes")).toBe(false);
  });

  it("requires full lowercase source commits and stable publication versions", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    expect(requireFullSha(sha, "Release preparation")).toBe(sha);
    for (const invalid of ["main", sha.slice(0, 12), sha.toUpperCase()]) {
      expect(() => requireFullSha(invalid, "Release preparation")).toThrow(
        "exact 40-character lowercase commit SHA",
      );
    }
    expect(requireStableVersion("0.35.0")).toBe("0.35.0");
    for (const invalid of ["01.2.3", "1.2.3-beta.1", "1.2.3+build.7"]) {
      expect(() => requireStableVersion(invalid)).toThrow(
        "Expected a stable release version in major.minor.patch form.",
      );
    }
  });

  it("reads a package version from a JSON object", () => {
    expect(readVersionFromJson('{"version":"0.35.0"}', "package.json")).toBe("0.35.0");
    expect(() => readVersionFromJson("null", "package.json")).toThrow(
      "Expected package.json to contain a JSON object.",
    );
    expect(() => readVersionFromJson('{"version":42}', "package.json")).toThrow(
      "Expected package.json to contain a string version field.",
    );
  });
});
