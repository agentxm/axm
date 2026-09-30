/**
 * The aggregate verification gate: continuous integration runs on every pull
 * request and merge group, and one always-run `required` job aggregates every
 * gating job so a skipped or failed check can never disappear from the verdict.
 *
 * Supersedes the retired specification identity
 * `system/process/merges-require-aggregate-verification`
 * (see `specifications/disposition-ledger.json`). Branch protection itself is
 * host-side; what the repository declares is this workflow shape.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
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
  it("continuous integration runs for every pull request", () => {
    expect(JSON.stringify(readWorkflow().on)).toContain("pull_request");
  });

  it("continuous integration validates requested merge groups", () => {
    const trigger = JSON.stringify(readWorkflow().on);
    expect(trigger).toContain("merge_group");
    expect(trigger).toContain("checks_requested");
  });

  it("runs daily full verification without producing release artifacts", () => {
    const workflow = readWorkflow();
    expect(JSON.stringify(workflow.on)).toContain("43 9 * * *");
    for (const job of ["verify-main", "verify-e2e", "windows-workspace"]) {
      expect(JSON.stringify(workflow.jobs[job])).toContain("github.event_name == 'schedule'");
    }
    for (const job of ["binary-smoke", "release-content", "npm-cohort"]) {
      expect(JSON.stringify(workflow.jobs[job])).not.toContain("github.event_name == 'schedule'");
    }
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
    const cacheWarmJob = workflow.jobs["warm-main-caches"];
    if (typeof cacheWarmJob !== "object" || cacheWarmJob === null) {
      throw new Error("the optional cache warmer must be declared");
    }
    expect(cacheWarmJob).toHaveProperty("continue-on-error", true);
    expect(needs).not.toContain("warm-main-caches");
    for (const name of Object.keys(workflow.jobs).filter(
      (job) => job !== "required" && job !== "warm-main-caches",
    )) {
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
    expect(gate).toContain("REQUIRED_JOBS");
    expect(JSON.stringify(aggregate)).toContain("needs.classify.outputs.required-jobs");
  });

  it("derives one broad-fallback affected range for PR classification and verification", () => {
    const workflow = readWorkflow();
    const serialized = JSON.stringify(workflow.jobs["classify"]);
    expect(serialized).toContain("nrwl/nx-set-shas@afb73a62d26e41464e9254689e1fd6122ee683c1");
    expect(serialized).toContain("git rev-list --max-parents=0 HEAD");
    expect(serialized).toContain("steps.set-shas.outputs.base");
    expect(serialized).toContain("steps.set-shas.outputs.head");
  });

  it("requires every published job to succeed", () => {
    const jobs = readWorkflow().jobs;
    const required = jobs["required"];
    if (
      typeof required !== "object" ||
      required === null ||
      !("steps" in required) ||
      !Array.isArray(required.steps)
    ) {
      throw new Error("Required CI must declare its aggregation step.");
    }
    const step: unknown = required.steps.find(
      (value: unknown) => typeof value === "object" && value !== null && "run" in value,
    );
    if (
      typeof step !== "object" ||
      step === null ||
      !("run" in step) ||
      typeof step.run !== "string"
    ) {
      throw new Error("Required CI must execute its aggregation script.");
    }
    const runScript = step.run;
    const directory = fs.mkdtempSync(path.join(tmpdir(), "axm-required-gate-"));
    const run = (
      requiredJobs: string,
      results: Readonly<Record<string, { readonly result: string }>>,
    ) => {
      const execution = spawnSync("bash", ["-e", "-o", "pipefail", "-c", runScript], {
        encoding: "utf8",
        env: {
          ...process.env,
          REQUIRED_JOBS: requiredJobs,
          RESULTS: JSON.stringify(results),
          GITHUB_STEP_SUMMARY: path.join(directory, "summary.md"),
        },
      });
      if (execution.error !== undefined) throw execution.error;
      return execution;
    };
    try {
      const allSuccess = Object.fromEntries(
        Object.keys(jobs)
          .filter((job) => job !== "required")
          .map((job) => [job, { result: "success" }]),
      );
      for (const result of ["success", "failure", "cancelled", "skipped", "missing"]) {
        const results = { ...allSuccess };
        if (result === "missing") delete results["verify-e2e"];
        else results["verify-e2e"] = { result };
        const execution = run('["classify","secrets","verify-e2e"]', results);
        expect(execution.status, `${result}\n${execution.stdout}${execution.stderr}`).toBe(
          result === "success" ? 0 : 1,
        );
      }
      expect(run("", allSuccess).status).toBe(1);
      expect(run("not JSON", allSuccess).status).toBe(1);
      expect(run("[]", allSuccess).status).toBe(1);
      const documentationOnly = Object.fromEntries(
        Object.keys(jobs)
          .filter((job) => job !== "required")
          .map((job) => [
            job,
            {
              result: ["classify", "secrets", "documentation"].includes(job)
                ? "success"
                : "skipped",
            },
          ]),
      );
      expect(run('["classify","secrets","documentation"]', documentationOnly).status).toBe(0);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("isolates queue cancellation and uses the tested revision in cache keys", () => {
    const workflow = readWorkflow();
    expect(JSON.stringify(workflow.concurrency)).toContain("github.event.merge_group.head_ref");
    const jobs = JSON.stringify(workflow.jobs);
    expect(jobs).toContain("needs.classify.outputs.head");
    expect(jobs).not.toContain("github.event.pull_request.head.sha");
  });

  it("routes proposed-change jobs from the classifier outputs", () => {
    const jobs = readWorkflow().jobs;
    expect(JSON.stringify(jobs["verify-pr"])).toContain("needs.classify.outputs.code");
    expect(JSON.stringify(jobs["specification-verdict"])).toContain(
      "needs.classify.outputs.specification-verdict",
    );
    expect(JSON.stringify(jobs["extension-lint"])).toContain(
      "needs.classify.outputs.extension-lint",
    );
    expect(JSON.stringify(jobs["verify-e2e"])).toContain("needs.classify.outputs.cli-e2e");
    expect(JSON.stringify(jobs["windows-workspace"])).toContain("needs.classify.outputs.windows");
    expect(JSON.stringify(jobs["binary-smoke"])).toContain("needs.classify.outputs.windows");
    expect(JSON.stringify(jobs["workflow-validation"])).toContain(
      "needs.classify.outputs.workflow-security",
    );
  });

  it("builds publication artifacts only for a canonical release commit", () => {
    const jobs = readWorkflow().jobs;
    expect(JSON.stringify(jobs["classify"])).toContain("HEAD_REF");
    expect(JSON.stringify(jobs["classify"])).toContain("HEAD_REPOSITORY");
    expect(JSON.stringify(jobs["verify-pr"])).toContain(
      "needs.classify.outputs.release-preparation",
    );
    for (const job of ["binary-smoke", "release-content", "npm-cohort"]) {
      expect(JSON.stringify(jobs[job])).toContain(
        "needs.classify.outputs.release-artifacts == 'true'",
      );
    }
    const binary = jobs["binary-smoke"];
    if (
      typeof binary !== "object" ||
      binary === null ||
      !("steps" in binary) ||
      !Array.isArray(binary.steps)
    ) {
      throw new Error("binary smoke must declare steps");
    }
    const binaryUpload = binary.steps.find(
      (step: unknown) =>
        typeof step === "object" &&
        step !== null &&
        "name" in step &&
        step.name === "Upload compiled binary",
    );
    expect(binaryUpload).toMatchObject({
      if: "needs.classify.outputs.release-artifacts == 'true'",
    });
    expect(JSON.stringify(jobs["release-content"])).toContain("axm:produce-release-content");
    expect(JSON.stringify(jobs["release-content"])).toContain(
      "axm-release-content-${{ github.sha }}",
    );
    expect(JSON.stringify(jobs["verify-main"])).toContain(
      "needs.classify.outputs.release-artifacts == 'true'",
    );
  });

  it("preserves workspace and E2E report evidence on hosted runners", () => {
    const jobs = readWorkflow().jobs;
    const workspace = JSON.stringify(jobs["verify-main"]);
    const e2e = JSON.stringify(jobs["verify-e2e"]);
    expect(workspace).toContain("ubuntu-latest");
    expect(workspace).toContain("pnpm run ci:workspace:report");
    expect(e2e).toContain("ubuntu-latest");
    expect(e2e).toContain("scripts/with-allure-report.sh");
    expect(e2e).toContain("cli-e2e:e2e-main");
    expect(e2e).toContain("binary-smoke install-suite");
    expect(e2e).toContain("pnpm exec nx affected -t e2e-main");
    expect(e2e).toContain("pnpm exec nx affected -t binary-smoke install-suite");
    expect(e2e).toContain("needs.classify.outputs.base");
    expect(e2e).toContain("needs.classify.outputs.head");
    expect(JSON.stringify(jobs["verify-pr"])).toContain("--exclude=cli-e2e");
    expect(jobs).not.toHaveProperty("verify-main-hosted");
  });
});

describe("native cache setup trust and configuration", () => {
  const scenarios = [
    { name: "unconfigured", url: "", token: "", code: 0, enabled: false },
    {
      name: "reader",
      url: "https://cache.example.test/",
      token: "fixture-reader",
      code: 0,
      enabled: true,
    },
    {
      name: "URL without credential",
      url: "https://cache.example.test",
      token: "",
      code: 1,
      enabled: false,
    },
    { name: "credential without URL", url: "", token: "fixture-reader", code: 1, enabled: false },
    {
      name: "invalid origin",
      url: "https://cache.example.test/path",
      token: "fixture-reader",
      code: 1,
      enabled: false,
    },
    {
      name: "newline credential",
      url: "https://cache.example.test",
      token: "fixture\nreader",
      code: 1,
      enabled: false,
    },
    {
      name: "fork",
      url: "https://cache.example.test",
      token: "",
      fork: "true",
      code: 0,
      enabled: false,
    },
    {
      name: "Dependabot",
      url: "https://cache.example.test",
      token: "",
      actor: "dependabot[bot]",
      code: 0,
      enabled: false,
    },
    {
      name: "explicit bypass",
      url: "https://cache.example.test",
      token: "",
      bypass: "true",
      code: 0,
      enabled: false,
    },
  ];
  for (const scenario of scenarios) {
    it(`handles ${scenario.name}`, () => {
      const action: unknown = YAML.parse(
        fs.readFileSync(path.join(repoRoot, ".github/actions/setup-workspace/action.yml"), "utf8"),
      );
      if (typeof action !== "object" || action === null || !("runs" in action))
        throw new Error("Missing setup action");
      const runs = action.runs;
      if (
        typeof runs !== "object" ||
        runs === null ||
        !("steps" in runs) ||
        !Array.isArray(runs.steps)
      )
        throw new Error("Missing action steps");
      const step: unknown = runs.steps.find(
        (candidate: unknown) =>
          typeof candidate === "object" &&
          candidate !== null &&
          "name" in candidate &&
          candidate.name === "Configure native Nx remote caching",
      );
      if (
        typeof step !== "object" ||
        step === null ||
        !("run" in step) ||
        typeof step.run !== "string"
      )
        throw new Error("Missing native cache setup");
      const directory = fs.mkdtempSync(path.join(tmpdir(), "nx-setup-"));
      const environmentFile = path.join(directory, "environment");
      fs.writeFileSync(environmentFile, "");
      try {
        const result = spawnSync("bash", ["-e", "-c", step.run], {
          encoding: "utf8",
          env: {
            ...process.env,
            GITHUB_ENV: environmentFile,
            REMOTE_CACHE_URL: scenario.url,
            REMOTE_CACHE_TOKEN: scenario.token,
            CACHE_ACTOR: "actor" in scenario ? scenario.actor : "fixture-user",
            CACHE_FORK: "fork" in scenario ? scenario.fork : "false",
            NX_SKIP_REMOTE_CACHE: "bypass" in scenario ? scenario.bypass : "false",
          },
        });
        expect(result.status).toBe(scenario.code);
        const values = fs.readFileSync(environmentFile, "utf8");
        expect(values).toContain("NX_CACHE_FAILURES=false");
        expect(values.includes("NX_SKIP_REMOTE_CACHE=false")).toBe(scenario.enabled);
        expect(values.includes("NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN=")).toBe(scenario.enabled);
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});

describe("main cache warming coverage", () => {
  for (const sourceEvent of ["push", "schedule", "workflow_dispatch"]) {
    it(`covers changed and missing hashes after ${sourceEvent}`, () => {
      const workflow: unknown = YAML.parse(
        fs.readFileSync(path.join(repoRoot, ".github/workflows/nx-cache.yml"), "utf8"),
      );
      if (typeof workflow !== "object" || workflow === null || !("jobs" in workflow))
        throw new Error("Missing warmer jobs");
      const jobs = workflow.jobs;
      if (typeof jobs !== "object" || jobs === null || !("warm" in jobs))
        throw new Error("Missing main warmer");
      const warm = jobs.warm;
      if (
        typeof warm !== "object" ||
        warm === null ||
        !("steps" in warm) ||
        !Array.isArray(warm.steps)
      )
        throw new Error("Missing warmer steps");
      const step: unknown = warm.steps.find(
        (candidate: unknown) =>
          typeof candidate === "object" &&
          candidate !== null &&
          "name" in candidate &&
          candidate.name === "Populate deterministic task outputs",
      );
      if (
        typeof step !== "object" ||
        step === null ||
        !("run" in step) ||
        typeof step.run !== "string"
      )
        throw new Error("Missing deterministic warmer command");
      const directory = fs.mkdtempSync(path.join(tmpdir(), "nx-warm-"));
      try {
        const result = spawnSync(
          "bash",
          [
            "-e",
            "-c",
            'pnpm() { printf "%s\\n" "$*" >> "$CAPTURE_FILE"; }; export -f pnpm; mkdir -p .nx/cache; printf "{}" > .nx/cache/run.json;\n' +
              step.run,
          ],
          {
            cwd: directory,
            encoding: "utf8",
            env: {
              ...process.env,
              SOURCE_EVENT: sourceEvent,
              CAPTURE_FILE: path.join(directory, "commands"),
            },
          },
        );
        expect(result.status, result.stderr).toBe(0);
        expect(fs.readFileSync(path.join(directory, "commands"), "utf8").trim()).toBe(
          "run cache:warm",
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});
