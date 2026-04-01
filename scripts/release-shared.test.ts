import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  releaseTagFromVersion,
  releaseVersionFromTag,
  validateReleaseTag,
} from "./release-shared.js";

describe("release tag helpers", () => {
  it("validates release tags through the scripts target", () => {
    const cliPackageJson = JSON.parse(readFileSync("packages/cli/package.json", "utf8")) as {
      readonly version: string;
    };
    const tag = `cli-v${cliPackageJson.version}`;
    const output = execFileSync(
      "pnpm",
      [
        "exec",
        "nx",
        "run",
        "scripts:validate-release-tag",
        "--outputStyle=stream-without-prefixes",
        "--",
        tag,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          NX_TUI: "false",
          NX_DEFAULT_OUTPUT_STYLE: "stream-without-prefixes",
          NX_TASKS_RUNNER_DYNAMIC_OUTPUT: "false",
        },
      },
    );

    expect(output).toContain(cliPackageJson.version);
  });

  it("emits release metadata through the scripts target", () => {
    const cliPackageJson = JSON.parse(readFileSync("packages/cli/package.json", "utf8")) as {
      readonly version: string;
    };
    const tag = `cli-v${cliPackageJson.version}`;
    const existingTag = execFileSync("git", ["tag", "--list", tag], {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
    const createdTag = existingTag === "";

    if (createdTag) {
      execFileSync("git", ["tag", tag, "HEAD"], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
    }

    try {
      const output = execFileSync(
        "pnpm",
        [
          "exec",
          "nx",
          "run",
          "scripts:resolve-release-meta",
          "--outputStyle=stream-without-prefixes",
          "--",
          tag,
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            NX_TUI: "false",
            NX_DEFAULT_OUTPUT_STYLE: "stream-without-prefixes",
            NX_TASKS_RUNNER_DYNAMIC_OUTPUT: "false",
          },
        },
      );

      expect(output).toContain(`tag=${tag}`);
      expect(output).toContain(`version=${cliPackageJson.version}`);
    } finally {
      if (createdTag) {
        execFileSync("git", ["tag", "-d", tag], {
          cwd: process.cwd(),
          encoding: "utf8",
        });
      }
    }
  });

  it("accepts prerelease and build metadata tags", () => {
    const tag = "cli-v1.2.3-beta.1+build.7";

    expect(validateReleaseTag(tag)).toBe(tag);
    expect(releaseVersionFromTag(tag)).toBe("1.2.3-beta.1+build.7");
    expect(releaseTagFromVersion("1.2.3-beta.1+build.7")).toBe(tag);
  });
});
