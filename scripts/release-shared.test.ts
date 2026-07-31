import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  releaseTagFromVersion,
  releaseVersionFromTag,
  readSkillCliVersion,
  stampSkillCliVersion,
  validateReleaseTag,
  writeSkillVersion,
} from "./release-shared.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("release tag helpers", () => {
  it("validates release tags through the root target", () => {
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
        "axm:validate-release-tag",
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

  it("emits release metadata through the root target", () => {
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
          "axm:resolve-release-meta",
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

describe("bundled skill release stamps", () => {
  it("updates the skill manifest and CLI version frontmatter", () => {
    const directory = mkdtempSync(join(tmpdir(), "axm-release-skill-"));
    temporaryDirectories.push(directory);
    const manifestPath = join(directory, "skill.json");
    const documentPath = join(directory, "SKILL.md");

    writeFileSync(manifestPath, '{\n  "name": "axm",\n  "version": "0.2.8"\n}\n', "utf8");
    writeFileSync(documentPath, '---\nname: axm\ncli-version: "0.2.8"\n---\n\n# AXM\n', "utf8");

    writeSkillVersion("0.24.9", manifestPath);
    stampSkillCliVersion("0.24.9", documentPath);

    expect(readFileSync(manifestPath, "utf8")).toContain('"version": "0.24.9"');
    expect(readSkillCliVersion(documentPath)).toBe("0.24.9");
  });
});
