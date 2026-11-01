import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { makeReleaseSnapshot } from "./release-runtime.js";

import { RELEASE_COHORT_TAG } from "./release-cohort.js";
import {
  parseCiArtifacts,
  parseGitHubRuns,
  readGeneratedSkillCompatibilityFromContent,
  readSkillCompatibilityFromContent,
  stampSkillCompatibilityContent,
  transitionSkillCompatibility,
  validateGeneratedSkillCompatibility,
  validateCiRunDetails,
  validateExactCiRunDetails,
  stampSkillManifestContent,
} from "./release-shared.js";

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  value != null && typeof value === "object";

const readJsonRecord = (path: string): Record<PropertyKey, unknown> => {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(parsed)) throw new Error(`Expected ${path} to contain a JSON object.`);
  return parsed;
};

const preparedRuntimeFile = "packages/core/extension-model/dist/src/unstable/extensions/common.js";

describe("release tag helpers", () => {
  it.effect("derives the cohort from the release group nx.json selects", () =>
    Effect.gen(function* () {
      const { packages: cohort } = yield* makeReleaseSnapshot();
      const nxJson = readJsonRecord("nx.json");
      const release = Reflect.get(nxJson, "release");
      if (!isRecord(release)) throw new Error("Expected a release configuration in nx.json.");

      // Derivation reads the `release:cli` tag directly, so Nx must still select
      // the release group by that same tag for the two to describe one cohort.
      expect(Reflect.get(release, "projects")).toEqual([`tag:${RELEASE_COHORT_TAG}`]);
      expect(Reflect.get(release, "projectsRelationship")).toBe("fixed");
      expect(cohort.map(({ name }) => name).sort()).toEqual([
        "@agentxm/extension-content",
        "@agentxm/extension-model",
        "@agentxm/registry-protocol",
        "@agentxm/specification-metadata",
        "@agentxm/workspace-conventions",
        "axm.sh",
      ]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("publishes every cohort member after the members its manifest depends on", () =>
    Effect.gen(function* () {
      const { packages: cohort } = yield* makeReleaseSnapshot();
      const releaseOrder = new Map(cohort.map(({ name }, index) => [name, index]));

      for (const releasePackage of cohort) {
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
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it("uses the shared cohort in the canonical publication helper", () => {
    const workflow = readFileSync(".github/workflows/publish.yml", "utf8");
    expect(workflow).toContain("axm:distribute-release");
    const publisher = readFileSync("scripts/distribute-release.ts", "utf8");
    expect(publisher).toContain("yield* ReleaseSnapshot");
    expect(workflow).not.toContain("release_packages=(");
  });

  it("emits release metadata through the root target without rebuilding prepared runtime", () => {
    const runtimeBefore = statSync(preparedRuntimeFile, { bigint: true });
    const cliPackageJson = readJsonRecord("apps/cli/package.json");
    if (typeof cliPackageJson["version"] !== "string") throw new Error("Expected CLI version.");
    const tag = `cli-v${cliPackageJson["version"]}`;
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
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
        headSha,
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
    expect(output).toContain(`version=${cliPackageJson["version"]}`);
    const runtimeAfter = statSync(preparedRuntimeFile, { bigint: true });
    expect(runtimeAfter.ino).toBe(runtimeBefore.ino);
    expect(runtimeAfter.mtimeNs).toBe(runtimeBefore.mtimeNs);
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
    // `gh run list` exposes the configured run name here, not the immutable
    // workflow identity. The REST details' workflow path is authoritative.
    workflowName: "CI - main",
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

  it("binds an explicitly selected merged-revision run to push CI", () => {
    expect(
      validateExactCiRunDetails(
        {
          id: 42,
          event: "push",
          head_sha: sha,
          path: ".github/workflows/ci.yml",
          run_attempt: 2,
          run_number: 8,
          status: "completed",
          conclusion: "success",
          html_url: "https://github.com/agentxm/axm/actions/runs/42",
          name: "CI - main",
        },
        { databaseId: 42, headSha: sha, event: "push" },
      ),
    ).toMatchObject({ databaseId: 42, headSha: sha, event: "push", attempt: 2 });

    expect(() =>
      validateExactCiRunDetails(
        {
          id: 42,
          event: "workflow_dispatch",
          head_sha: sha,
          path: ".github/workflows/ci.yml",
          run_attempt: 2,
          run_number: 8,
          status: "completed",
          conclusion: "success",
          html_url: "https://github.com/agentxm/axm/actions/runs/42",
          name: "CI - main",
        },
        { databaseId: 42, headSha: sha, event: "push" },
      ),
    ).toThrow("provenance");
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
  it("renders the manifest and transitions the managed compatibility range", () => {
    const manifest = stampSkillManifestContent(
      '{\n  "name": "axm",\n  "version": "0.2.8",\n  "description": "Test skill"\n}\n',
      "0.24.9",
    );
    const document = stampSkillCompatibilityContent(
      '---\nname: axm\ndescription: AXM test skill.\nmetadata:\n  axm.sh/cli-version: "0.2.8"\n  axm.sh/cli-version-range: ">=0.2.0 <0.3.0"\n---\n\n# AXM\n',
      "0.24.9",
    );
    expect(JSON.parse(manifest)).toMatchObject({ version: "0.24.9", description: "Test skill" });
    expect(readSkillCompatibilityFromContent(document, "SKILL.md")).toEqual({
      cliVersion: "0.24.9",
      cliVersionRange: ">=0.24.0 <0.25.0",
    });
  });

  it("retains the managed minor band for a patch release", () => {
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
      transitionSkillCompatibility({ cliVersion: "1.2.3", cliVersionRange: "1.2.3" }, "1.2.4"),
    ).toThrow("skill-release-range-mismatch");

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
