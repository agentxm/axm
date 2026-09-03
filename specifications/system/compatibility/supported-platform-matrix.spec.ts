import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import YAML from "yaml";

import {
  defineBoundEvidence,
  defineSpecification,
} from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "system/compatibility/supported-platform-matrix",
  title: "Every supported platform and shell receives release-blocking verification",
  statement:
    "Every supported operating system and architecture shall receive release-blocking verification of the compiled binary, every supported installer shell shall receive release-blocking verification of the installed product, and Windows workspace behavior shall be verified on a real Windows runner.",
  class: "quality",
  characteristic: "compatibility",
  role: "supporting",
  goals: ["platform-reach"],
  boundary: "repository",
  boundaryRationale:
    "The committed ci.yml and publish.yml workflow files are read only as a coverage check showing which supported platforms, shells, and runners the bound matrix jobs cover; the compatibility evidence itself comes from the binary, platform, and installed executions those jobs run on each platform.",
  methods: ["contract"],
  selection: "platform-matrix",
  derivedFrom: ["system/installability/product-installs-through-supported-channels"],
  supersedes: [],
  assumptions: [
    "A job named in the workflow files blocks its merge or release rather than running as an advisory check.",
  ],
  openQuestions: [],
});

/**
 * The continuous-integration and release matrix jobs run the bound binary,
 * platform, and installed executions on every supported platform and shell.
 * Their results are evidence bound to this identity; the specification
 * remains the sole requirements authority.
 */
export const boundEvidence = defineBoundEvidence([
  {
    gate: "ci: binary-smoke",
    verifies:
      "Runs the compiled-binary smoke execution on every supported operating system and architecture for every change that reaches the main branch, producing the binaries a release attaches.",
  },
  {
    gate: "ci: windows-workspace",
    verifies:
      "Runs the Windows workspace mutation execution on a real Windows runner for every change.",
  },
  {
    gate: "publish: install-verify",
    verifies:
      "Runs the installer verification execution against the real release assets on every supported installer shell before the release workflow completes.",
  },
]);

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

/** The supported binary targets AXM promises. */
const SUPPORTED_BINARIES = [
  "axm-linux-x64",
  "axm-linux-arm64",
  "axm-darwin-arm64",
  "axm-darwin-x64",
  "axm-windows-x64.exe",
] as const;

/** The supported installer shells. */
const SUPPORTED_SHELLS = ["bash", "powershell", "cmd"] as const;

type WorkflowJob = Partial<Record<string, unknown>>;

const readWorkflowJobs = (fileName: string): Readonly<Record<string, unknown>> => {
  const parsed: unknown = YAML.parse(
    fs.readFileSync(path.join(repoRoot, ".github", "workflows", fileName), "utf8"),
  );
  if (typeof parsed !== "object" || parsed === null || !("jobs" in parsed)) {
    throw new Error(`${fileName} must declare jobs`);
  }
  const jobs = parsed.jobs;
  if (typeof jobs !== "object" || jobs === null) {
    throw new Error(`${fileName} jobs must be a mapping`);
  }
  return Object.fromEntries(Object.entries(jobs));
};

const readJob = (jobs: Readonly<Record<string, unknown>>, name: string): WorkflowJob => {
  const job = jobs[name];
  if (typeof job !== "object" || job === null) {
    throw new Error(`workflow must define the \`${name}\` job`);
  }
  return { ...job };
};

/** The values one key takes across a job's explicit matrix entries. */
const matrixValues = (job: WorkflowJob, key: string): ReadonlyArray<string> => {
  const strategy = job["strategy"];
  if (typeof strategy !== "object" || strategy === null || !("matrix" in strategy)) {
    throw new Error("job must declare a matrix strategy");
  }
  const matrix = strategy.matrix;
  if (typeof matrix !== "object" || matrix === null || !("include" in matrix)) {
    throw new Error("job matrix must list explicit entries");
  }
  const include = matrix.include;
  if (!Array.isArray(include)) {
    throw new Error("job matrix entries must be a list");
  }
  return include.flatMap((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }
    const record: WorkflowJob = { ...entry };
    const value = record[key];
    return typeof value === "string" ? [value] : [];
  });
};

const jobNeeds = (job: WorkflowJob): ReadonlyArray<string> => {
  const needs = job["needs"];
  if (typeof needs === "string") {
    return [needs];
  }
  return Array.isArray(needs)
    ? needs.filter((entry): entry is string => typeof entry === "string")
    : [];
};

const jobSteps = (job: WorkflowJob): string => JSON.stringify(job["steps"] ?? []);

describe("Supported platform matrix", () => {
  it.effect("binary verification covers every supported operating system and architecture", () =>
    Effect.sync(() => {
      const jobs = readWorkflowJobs("ci.yml");
      const binarySmoke = readJob(jobs, "binary-smoke");
      expect([...matrixValues(binarySmoke, "binary_name")].sort()).toEqual(
        [...SUPPORTED_BINARIES].sort(),
      );
      expect(jobSteps(binarySmoke)).toContain("cli-e2e:binary-smoke-artifact");
      expect(jobNeeds(readJob(jobs, "required"))).toContain("binary-smoke");
    }),
  );

  it.effect(
    "installed-product verification covers every supported shell within the release workflow",
    () =>
      Effect.sync(() => {
        const jobs = readWorkflowJobs("publish.yml");
        const installVerify = readJob(jobs, "install-verify");
        // Several operating systems share the bash installer; the coverage
        // check compares the distinct shells the matrix exercises.
        expect([...new Set(matrixValues(installVerify, "mode"))].sort()).toEqual(
          [...SUPPORTED_SHELLS].sort(),
        );
        expect(jobSteps(installVerify)).toContain("cli-e2e:install-verification");
        // Installer verification runs against the published release assets,
        // so the release workflow cannot complete without it.
        expect(jobNeeds(installVerify)).toContain("release");
      }),
  );

  it.effect("Windows workspace behavior runs on a real Windows runner", () =>
    Effect.sync(() => {
      const jobs = readWorkflowJobs("ci.yml");
      const windowsWorkspace = readJob(jobs, "windows-workspace");
      expect(windowsWorkspace["runs-on"]).toMatch(/^windows-/);
      expect(jobSteps(windowsWorkspace)).toContain("cli-e2e:e2e-windows");
      expect(jobNeeds(readJob(jobs, "required"))).toContain("windows-workspace");
    }),
  );
});
