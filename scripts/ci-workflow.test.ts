/**
 * The aggregate verification gate: continuous integration runs on every pull
 * request and merge group, and one always-run `required` job aggregates every
 * other job so a skipped or failed check can never disappear from the verdict.
 *
 * Supersedes the retired specification identity
 * `system/process/merges-require-aggregate-verification`
 * (see `specifications/disposition-ledger.json`). Branch protection itself is
 * host-side; what the repository declares is this workflow shape.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import YAML from "yaml";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

const readWorkflow = (): {
  readonly concurrency: unknown;
  readonly jobs: Readonly<Record<string, unknown>>;
  readonly on: unknown;
} => {
  const parsed: unknown = YAML.parse(
    fs.readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8"),
  );
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("jobs" in parsed) ||
    !("concurrency" in parsed)
  ) {
    throw new Error("ci.yml must declare jobs and concurrency");
  }
  const jobs = parsed.jobs;
  if (typeof jobs !== "object" || jobs === null) {
    throw new Error("ci.yml jobs must be a mapping");
  }
  // YAML parses the `on:` trigger key as boolean true.
  const triggers =
    "on" in parsed ? parsed.on : (Object.fromEntries(Object.entries(parsed))["true"] ?? undefined);
  return {
    concurrency: parsed.concurrency,
    jobs: Object.fromEntries(Object.entries(jobs)),
    on: triggers,
  };
};

describe("aggregate required verification", () => {
  it.each([
    {
      event: "pull_request",
      ref: "release/cli-v0.30.2",
      repository: "agentxm/axm",
      subject: "release: cli-v0.30.2",
      prepared: true,
    },
    {
      event: "pull_request",
      ref: "feature/example",
      repository: "agentxm/axm",
      subject: "release: cli-v0.30.2",
      prepared: false,
    },
    {
      event: "pull_request",
      ref: "release/cli-v0.30.2",
      repository: "example/fork",
      subject: "release: cli-v0.30.2",
      prepared: false,
    },
    {
      event: "merge_group",
      ref: "",
      repository: "",
      subject: "release: cli-v0.30.2 (#327)",
      prepared: true,
    },
    {
      event: "merge_group",
      ref: "",
      repository: "",
      subject: "Improve workspace policy (#328)",
      prepared: false,
    },
    {
      event: "merge_group",
      ref: "",
      repository: "",
      subject: "release: cli-v0.30.2 unreviewed suffix (#327)",
      prepared: false,
    },
  ])(
    "selects prepared-release verification for $event: $subject ($repository, $ref)",
    (scenario) => {
      const job = readWorkflow().jobs["verify-pr"];
      if (
        typeof job !== "object" ||
        job === null ||
        !("steps" in job) ||
        !Array.isArray(job.steps)
      ) {
        throw new Error("The proposed-change job must declare steps.");
      }
      const steps: ReadonlyArray<unknown> = job.steps;
      const step = steps.find(
        (candidate) =>
          typeof candidate === "object" &&
          candidate !== null &&
          "name" in candidate &&
          candidate.name === "Determine release verification mode",
      );
      if (
        typeof step !== "object" ||
        step === null ||
        !("run" in step) ||
        typeof step.run !== "string"
      ) {
        throw new Error("The release verification mode must declare a shell command.");
      }
      const directory = fs.mkdtempSync(path.join(tmpdir(), "axm-ci-release-mode-"));
      const environment = {
        PATH: process.env["PATH"],
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_TERMINAL_PROMPT: "0",
      };
      const git = (...args: string[]) =>
        execFileSync("git", args, { cwd: directory, env: environment, encoding: "utf8" }).trim();
      try {
        git("init", "--quiet", "--initial-branch=main");
        git("config", "user.name", "CI release-mode fixture");
        git("config", "user.email", "ci-release-mode@example.invalid");
        git("commit", "--quiet", "--allow-empty", "-m", "Base");
        git("checkout", "--quiet", "-b", "candidate");
        git("commit", "--quiet", "--allow-empty", "-m", scenario.subject);
        const output = path.join(directory, "output");
        const result = spawnSync(
          "bash",
          ["--noprofile", "--norc", "-euo", "pipefail", "-c", step.run],
          {
            cwd: directory,
            env: {
              ...environment,
              EVENT_NAME: scenario.event,
              HEAD_REF: scenario.ref,
              HEAD_REPOSITORY: scenario.repository,
              HEAD_SHA: git("rev-parse", "HEAD"),
              GITHUB_REPOSITORY: "agentxm/axm",
              GITHUB_OUTPUT: output,
            },
            encoding: "utf8",
            timeout: 5_000,
          },
        );
        expect(result.error).toBeUndefined();
        expect(result.status, result.stderr).toBe(0);
        expect(fs.readFileSync(output, "utf8").trim()).toBe(
          `release_preparation=${scenario.prepared}`,
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it("continuous integration runs for every pull request", () => {
    expect(JSON.stringify(readWorkflow().on)).toContain("pull_request");
  });

  it("continuous integration validates requested merge groups", () => {
    const trigger = JSON.stringify(readWorkflow().on);
    expect(trigger).toContain("merge_group");
    expect(trigger).toContain("checks_requested");
  });

  it("one always-run aggregate job gates on every applicable check", () => {
    const workflow = readWorkflow();
    const required = workflow.jobs["required"];
    if (typeof required !== "object" || required === null) {
      throw new Error("ci.yml must define the aggregate `required` job");
    }
    const requiredJob: Partial<Record<string, unknown>> = { ...required };
    // The gate runs regardless of upstream outcomes so a skipped or failed
    // dependency can never disappear from the verdict.
    expect(requiredJob["if"]).toContain("always()");
    const needs = requiredJob["needs"];
    if (!Array.isArray(needs)) {
      throw new Error("the required job must aggregate its checks through `needs`");
    }
    for (const name of Object.keys(workflow.jobs).filter((job) => job !== "required")) {
      expect(needs).toContain(name);
    }

    const steps = requiredJob["steps"];
    if (!Array.isArray(steps)) {
      throw new Error("the required job must declare its aggregate step");
    }
    const aggregate = steps.find(
      (step) => typeof step === "object" && step !== null && "run" in step,
    );
    if (typeof aggregate !== "object" || aggregate === null || !("run" in aggregate)) {
      throw new Error("the required job must declare its aggregate run script");
    }
    const gate = aggregate.run;
    if (typeof gate !== "string") {
      throw new Error("the required aggregate run script must be a string");
    }
    expect(gate).toContain('.[$job].result // "missing"');
    expect(gate).toContain('[[ "$result" != "success" ]]');
    expect(gate).toContain("verify-pr");
    expect(gate).toContain('"merge_group"');
  });

  it("derives one broad-fallback affected range for PR classification and verification", () => {
    const workflow = readWorkflow();
    const serialized = JSON.stringify(workflow.jobs["classify"]);
    expect(serialized).toContain("nrwl/nx-set-shas@afb73a62d26e41464e9254689e1fd6122ee683c1");
    expect(serialized).toContain("git rev-list --max-parents=0 HEAD");
    expect(serialized).toContain("steps.set-shas.outputs.base");
    expect(serialized).toContain("steps.set-shas.outputs.head");
  });

  it("isolates queue cancellation and uses the tested revision in cache keys", () => {
    const workflow = readWorkflow();
    expect(JSON.stringify(workflow.concurrency)).toContain("github.event.merge_group.head_ref");
    const jobs = JSON.stringify(workflow.jobs);
    expect(jobs).toContain("needs.classify.outputs.head");
    expect(jobs).not.toContain("github.event.pull_request.head.sha");
  });

  it("preserves workspace and E2E report evidence on hosted runners", () => {
    const jobs = readWorkflow().jobs;
    const workspace = JSON.stringify(jobs["verify-main"]);
    const e2e = JSON.stringify(jobs["verify-e2e-main"]);
    expect(workspace).toContain("ubuntu-latest");
    expect(workspace).toContain("pnpm run ci:workspace:report");
    expect(e2e).toContain("ubuntu-latest");
    expect(e2e).toContain("scripts/with-allure-report.sh");
    expect(e2e).toContain("cli-e2e:e2e-main");
    expect(e2e).toContain("binary-smoke install-suite");
    expect(jobs).not.toHaveProperty("verify-main-hosted");
  });
});
