import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  releaseTagFromVersion,
  releaseVersionFromTag,
  readGeneratedSkillCompatibilityFromContent,
  readSkillCompatibility,
  stampSkillCompatibility,
  transitionSkillCompatibility,
  validateGeneratedSkillCompatibility,
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
  it("updates the manifest and transitions an exact compatibility range", () => {
    const directory = mkdtempSync(join(tmpdir(), "axm-release-skill-"));
    temporaryDirectories.push(directory);
    const manifestPath = join(directory, "skill.json");
    const documentPath = join(directory, "SKILL.md");

    writeFileSync(manifestPath, '{\n  "name": "axm",\n  "version": "0.2.8"\n}\n', "utf8");
    writeFileSync(
      documentPath,
      '---\nname: axm\ndescription: AXM test skill.\nmetadata:\n  axm.sh/cli-version: "0.2.8"\n  axm.sh/cli-version-range: "0.2.8"\n---\n\n# AXM\n',
      "utf8",
    );

    writeSkillVersion("0.24.9", manifestPath);
    stampSkillCompatibility("0.24.9", documentPath);

    expect(readFileSync(manifestPath, "utf8")).toContain('"version": "0.24.9"');
    expect(readSkillCompatibility(documentPath)).toEqual({
      cliVersion: "0.24.9",
      cliVersionRange: "0.24.9",
    });
  });

  it("preserves an intentional range only when it includes the next release", () => {
    expect(
      transitionSkillCompatibility(
        { cliVersion: "1.2.3", cliVersionRange: ">=1.2.0 <1.3.0" },
        "1.2.4",
      ),
    ).toEqual({ cliVersion: "1.2.4", cliVersionRange: ">=1.2.0 <1.3.0" });

    expect(() =>
      transitionSkillCompatibility(
        { cliVersion: "1.2.3", cliVersionRange: ">=1.2.0 <1.3.0" },
        "1.3.0",
      ),
    ).toThrow("skill-release-range-mismatch");
  });

  it("rejects malformed or mismatched current declarations", () => {
    expect(() =>
      transitionSkillCompatibility({ cliVersion: "1.2.3", cliVersionRange: ">=1.2.0" }, "1.2.4"),
    ).toThrow("compatibility-metadata-malformed");

    expect(() =>
      transitionSkillCompatibility({ cliVersion: "1.2.3", cliVersionRange: "1.2.2" }, "1.2.4"),
    ).toThrow("skill-release-range-mismatch");
  });

  it("reads generated compatibility constants and rejects incomplete output", () => {
    expect(
      readGeneratedSkillCompatibilityFromContent(
        'export const AXM_SKILL_VERSION = "1.2.3";\nexport const AXM_SKILL_CLI_VERSION = "1.2.3";\nexport const AXM_SKILL_CLI_VERSION_RANGE = ">=1.2.0 <1.3.0";\n',
        "generated.ts",
      ),
    ).toEqual({
      version: "1.2.3",
      cliVersion: "1.2.3",
      cliVersionRange: ">=1.2.0 <1.3.0",
    });

    expect(() =>
      readGeneratedSkillCompatibilityFromContent(
        'export const AXM_SKILL_VERSION = "1.2.3";\n',
        "generated.ts",
      ),
    ).toThrow("AXM_SKILL_CLI_VERSION");
  });

  it("rejects generated constants that drift from the canonical declaration", () => {
    expect(() =>
      validateGeneratedSkillCompatibility(
        "1.2.3",
        { cliVersion: "1.2.3", cliVersionRange: "1.2.3" },
        { version: "1.2.3", cliVersion: "1.2.2", cliVersionRange: "1.2.3" },
        "generated.ts",
      ),
    ).toThrow("Generated AXM skill mismatch");
  });
});
