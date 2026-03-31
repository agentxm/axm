import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  releaseTagFromVersion,
  releaseVersionFromTag,
  validateReleaseTag,
} from "./release-shared.js";

describe("release tag helpers", () => {
  it("loads release helpers under bun without requiring built workspace packages", () => {
    const cliPackageJson = JSON.parse(readFileSync("packages/cli/package.json", "utf8")) as {
      readonly version: string;
    };
    const tag = `cli-v${cliPackageJson.version}`;
    const output = execFileSync("bun", ["scripts/validate-release-tag.ts", tag], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(output.trim()).toBe(cliPackageJson.version);
  });

  it("accepts prerelease and build metadata tags", () => {
    const tag = "cli-v1.2.3-beta.1+build.7";

    expect(validateReleaseTag(tag)).toBe(tag);
    expect(releaseVersionFromTag(tag)).toBe("1.2.3-beta.1+build.7");
    expect(releaseTagFromVersion("1.2.3-beta.1+build.7")).toBe(tag);
  });
});
