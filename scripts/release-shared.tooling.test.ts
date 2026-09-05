import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  RELEASE_PACKAGES,
  releaseTagFromVersion,
  releaseVersionFromTag,
  readGeneratedSkillCompatibilityFromContent,
  readSkillCompatibility,
  releaseCommitSubjectPattern,
  stampSkillCompatibility,
  transitionSkillCompatibility,
  validateGeneratedSkillCompatibility,
  validateReleaseTag,
  writeSkillVersion,
} from "./release-shared.js";

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  value != null && typeof value === "object";

const readJsonRecord = (path: string): Record<PropertyKey, unknown> => {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(parsed)) throw new Error(`Expected ${path} to contain a JSON object.`);
  return parsed;
};

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("release tag helpers", () => {
  it("publishes every release:cli project in dependency order", () => {
    const releaseNames = RELEASE_PACKAGES.map(({ name }) => name);
    const releaseOrder = new Map(releaseNames.map((name, index) => [name, index]));
    const taggedReleaseNames = readdirSync("packages", { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isDirectory()) return [];

      const projectPath = join("packages", entry.name, "project.json");
      const packagePath = join("packages", entry.name, "package.json");
      if (!existsSync(projectPath) || !existsSync(packagePath)) return [];

      const projectJson = readJsonRecord(projectPath);
      const tags = Reflect.get(projectJson, "tags");
      if (!Array.isArray(tags) || !tags.includes("release:cli")) return [];

      const packageJson = readJsonRecord(packagePath);
      const name = Reflect.get(packageJson, "name");
      if (typeof name !== "string") throw new Error(`Missing package name in ${packagePath}.`);
      return [name];
    });

    expect([...releaseNames].sort()).toEqual([...taggedReleaseNames].sort());

    for (const releasePackage of RELEASE_PACKAGES) {
      const packageJson = readJsonRecord(releasePackage.path);
      const dependencies = Reflect.get(packageJson, "dependencies");
      if (!isRecord(dependencies)) continue;

      const packageIndex = releaseOrder.get(releasePackage.name);
      if (packageIndex === undefined)
        throw new Error(`Missing ${releasePackage.name} in release order.`);

      for (const dependencyName of Object.keys(dependencies)) {
        const dependencyIndex = releaseOrder.get(dependencyName);
        if (dependencyIndex !== undefined) expect(dependencyIndex).toBeLessThan(packageIndex);
      }
    }
  });

  it("uses the shared cohort in the canonical publication helper", () => {
    const workflow = readFileSync(".github/workflows/publish.yml", "utf8");
    expect(workflow).toContain("axm:distribute-release");
    const publisher = readFileSync("scripts/distribute-release.ts", "utf8");
    expect(publisher).toContain("RELEASE_PACKAGES");
    expect(workflow).not.toContain("release_packages=(");
  });

  it("matches prepared and GitHub squash-merged release subjects", () => {
    const pattern = new RegExp(releaseCommitSubjectPattern("cli-v0.27.3"));

    expect(pattern.test("release: cli-v0.27.3")).toBe(true);
    expect(pattern.test("release: cli-v0.27.3 (#188)")).toBe(true);
    expect(pattern.test("release: cli-v0.27.30 (#188)")).toBe(false);
    expect(pattern.test("release: cli-v0.27.3 follow-up")).toBe(false);
  });

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

    writeFileSync(
      manifestPath,
      '{\n  "name": "axm",\n  "version": "0.2.8",\n  "description": "Test skill"\n}\n',
      "utf8",
    );
    writeFileSync(
      documentPath,
      '---\nname: axm\ndescription: AXM test skill.\nmetadata:\n  axm.sh/cli-version: "0.2.8"\n  axm.sh/cli-version-range: "0.2.8"\n---\n\n# AXM\n',
      "utf8",
    );

    writeSkillVersion("0.24.9", manifestPath);
    stampSkillCompatibility("0.24.9", documentPath);

    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toMatchObject({
      version: "0.24.9",
      description: "Test skill",
    });
    expect(readSkillCompatibility(documentPath)).toEqual({
      cliVersion: "0.24.9",
      cliVersionRange: ">=0.24.0 <0.25.0",
    });
  });

  it("widens an exact pin into the release minor band", () => {
    expect(
      transitionSkillCompatibility({ cliVersion: "0.27.9", cliVersionRange: "0.27.9" }, "0.27.11"),
    ).toEqual({ cliVersion: "0.27.11", cliVersionRange: ">=0.27.0 <0.28.0" });

    // A patch release no longer strands workspaces still holding the previous
    // patch's skill.
    expect(
      transitionSkillCompatibility(
        { cliVersion: "0.27.11", cliVersionRange: ">=0.27.0 <0.28.0" },
        "0.27.12",
      ),
    ).toEqual({ cliVersion: "0.27.12", cliVersionRange: ">=0.27.0 <0.28.0" });
  });

  it("rolls a managed minor band forward for a breaking release", () => {
    expect(
      transitionSkillCompatibility(
        { cliVersion: "0.27.18", cliVersionRange: ">=0.27.0 <0.28.0" },
        "0.28.0",
      ),
    ).toEqual({ cliVersion: "0.28.0", cliVersionRange: ">=0.28.0 <0.29.0" });
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
        { cliVersion: "1.2.3", cliVersionRange: ">=1.2.2 <1.3.0" },
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
