import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { RELEASE_COHORT_TAG } from "./release-cohort.js";
import {
  RELEASE_PACKAGES,
  parseCiArtifacts,
  parseGitHubRuns,
  releaseTagFromVersion,
  releaseVersionFromTag,
  readGeneratedSkillCompatibilityFromContent,
  readSkillCompatibility,
  releaseCommitSubjectPattern,
  stampSkillCompatibility,
  transitionSkillCompatibility,
  validateGeneratedSkillCompatibility,
  validateReleaseTag,
  validateCiRunDetails,
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
const preparedRuntimeFile = "packages/core/extension-model/dist/src/unstable/extensions/common.js";

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("release tag helpers", () => {
  it("derives the cohort from the release group nx.json selects", () => {
    const nxJson = readJsonRecord("nx.json");
    const release = Reflect.get(nxJson, "release");
    if (!isRecord(release)) throw new Error("Expected a release configuration in nx.json.");

    // Derivation reads the `release:cli` tag directly, so Nx must still select
    // the release group by that same tag for the two to describe one cohort.
    expect(Reflect.get(release, "projects")).toEqual([`tag:${RELEASE_COHORT_TAG}`]);
    expect(Reflect.get(release, "projectsRelationship")).toBe("fixed");
    expect(RELEASE_PACKAGES.length).toBeGreaterThan(0);
  });

  it("publishes every cohort member after the members its manifest depends on", () => {
    const releaseOrder = new Map(RELEASE_PACKAGES.map(({ name }, index) => [name, index]));

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

  it("validates release tags through the root target without rebuilding prepared runtime", () => {
    const runtimeBefore = statSync(preparedRuntimeFile, { bigint: true });
    const cliPackageJson = JSON.parse(readFileSync("apps/cli/package.json", "utf8")) as {
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
        "--excludeTaskDependencies",
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
          NX_SKIP_NX_CACHE: "true",
        },
      },
    );

    expect(output).toContain(cliPackageJson.version);
    const runtimeAfter = statSync(preparedRuntimeFile, { bigint: true });
    expect(runtimeAfter.ino).toBe(runtimeBefore.ino);
    expect(runtimeAfter.mtimeNs).toBe(runtimeBefore.mtimeNs);
  });

  it("emits release metadata through the root target without rebuilding prepared runtime", () => {
    const runtimeBefore = statSync(preparedRuntimeFile, { bigint: true });
    const cliPackageJson = JSON.parse(readFileSync("apps/cli/package.json", "utf8")) as {
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
          "--excludeTaskDependencies",
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
            NX_SKIP_NX_CACHE: "true",
          },
        },
      );

      expect(output).toContain(`tag=${tag}`);
      expect(output).toContain(`version=${cliPackageJson.version}`);
      const runtimeAfter = statSync(preparedRuntimeFile, { bigint: true });
      expect(runtimeAfter.ino).toBe(runtimeBefore.ino);
      expect(runtimeAfter.mtimeNs).toBe(runtimeBefore.mtimeNs);
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

describe("release CI producer provenance", () => {
  const sha = "a".repeat(40);
  const listedRun = {
    databaseId: 42,
    event: "workflow_dispatch",
    headSha: sha,
    number: 7,
    status: "completed",
    conclusion: "success",
    url: "https://github.com/agentxm/axm/actions/runs/42",
    workflowName: "CI",
  };

  it("accepts an exact successful workflow_dispatch attempt", () => {
    const parsed = parseGitHubRuns(JSON.stringify([listedRun]));
    expect(parsed).toEqual([listedRun]);
    expect(
      validateCiRunDetails(
        {
          id: 42,
          event: "workflow_dispatch",
          head_sha: sha,
          path: ".github/workflows/ci.yml",
          run_attempt: 3,
          status: "completed",
          conclusion: "success",
        },
        listedRun,
      ).attempt,
    ).toBe(3);
  });

  it("rejects an ineligible event or mismatched producer identity", () => {
    expect(() =>
      validateCiRunDetails(
        {
          id: 42,
          event: "pull_request",
          head_sha: sha,
          path: ".github/workflows/ci.yml",
          run_attempt: 1,
          status: "completed",
          conclusion: "success",
        },
        { ...listedRun, event: "pull_request" },
      ),
    ).toThrow("not an eligible release producer");
    expect(() =>
      validateCiRunDetails(
        {
          id: 42,
          event: "workflow_dispatch",
          head_sha: "b".repeat(40),
          path: ".github/workflows/ci.yml",
          run_attempt: 1,
          status: "completed",
          conclusion: "success",
        },
        listedRun,
      ),
    ).toThrow("provenance");
  });

  it("requires exact, live artifacts from the selected run", () => {
    const run = { ...listedRun, attempt: 2 };
    expect(
      parseCiArtifacts(
        [
          {
            artifacts: [
              {
                id: 9,
                name: `axm-npm-cohort-${sha}`,
                digest: `sha256:${"c".repeat(64)}`,
                expired: false,
                workflow_run: { id: 42, head_sha: sha },
              },
            ],
          },
        ],
        run,
      ),
    ).toEqual([{ id: 9, name: `axm-npm-cohort-${sha}`, digest: `sha256:${"c".repeat(64)}` }]);
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
