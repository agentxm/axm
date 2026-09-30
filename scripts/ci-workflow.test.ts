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
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { createVitest } from "vitest/node";
import YAML from "yaml";
import { withoutLocalGitEnvironment } from "@agentxm/client-e2e-utils";

import { classifyCiChanges, parseChangedPaths, requiredCiJobs } from "./classify-ci-changes.js";

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

  it("manual verification exercises native binaries without selecting publication artifacts", () => {
    const workflow = readWorkflow();
    expect(JSON.stringify(workflow.jobs["binary-smoke"])).toContain(
      "github.event_name == 'workflow_dispatch'",
    );
    for (const job of ["release-content", "npm-cohort"]) {
      expect(JSON.stringify(workflow.jobs[job])).not.toContain(
        "github.event_name == 'workflow_dispatch'",
      );
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

  it("selects CLI and platform checks for an earlier commit in a multi-commit merge group", () => {
    const job = readWorkflow().jobs["classify"];
    if (typeof job !== "object" || job === null || !("steps" in job) || !Array.isArray(job.steps))
      throw new Error("Classification must declare its affected-range steps.");
    const selector: unknown = job.steps.find(
      (step: unknown) =>
        typeof step === "object" && step !== null && "id" in step && step.id === "set-shas",
    );
    if (
      typeof selector !== "object" ||
      selector === null ||
      !("run" in selector) ||
      typeof selector.run !== "string"
    )
      throw new Error("Classification must select the complete queue range.");
    expect(selector).toHaveProperty(
      "env.QUEUE_BASE_SHA",
      "${{ github.event.merge_group.base_sha }}",
    );
    expect(selector).toHaveProperty(
      "env.QUEUE_HEAD_SHA",
      "${{ github.event.merge_group.head_sha }}",
    );
    expect(selector).toHaveProperty("env.NX_BASE_SHA", "${{ steps.nx-shas.outputs.base }}");
    expect(selector).toHaveProperty("env.NX_HEAD_SHA", "${{ steps.nx-shas.outputs.head }}");
    const nx: unknown = job.steps.find(
      (step: unknown) =>
        typeof step === "object" && step !== null && "id" in step && step.id === "nx-shas",
    );
    expect(nx).toHaveProperty("if", "github.event_name != 'merge_group'");

    const directory = fs.mkdtempSync(path.join(tmpdir(), "axm-queue-range-"));
    const env = withoutLocalGitEnvironment(process.env);
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: directory, env, encoding: "utf8" });
    const commit = (message: string) => {
      git("add", ".");
      git(
        "-c",
        "user.name=Queue fixture",
        "-c",
        "user.email=queue@example.test",
        "-c",
        "commit.gpgSign=false",
        "commit",
        "--quiet",
        "-m",
        message,
      );
      return git("rev-parse", "HEAD").trim();
    };
    try {
      git("init", "--quiet");
      fs.mkdirSync(path.join(directory, "contributing"));
      fs.writeFileSync(path.join(directory, "contributing/guide.md"), "Initial documentation\n");
      const base = commit("Initial revision");
      fs.mkdirSync(path.join(directory, "apps/cli/src"), { recursive: true });
      fs.writeFileSync(path.join(directory, "apps/cli/src/main.ts"), "export {};\n");
      const finalParent = commit("Change CLI behavior");
      fs.writeFileSync(path.join(directory, "contributing/guide.md"), "Clarify documentation\n");
      const head = commit("Clarify documentation");
      const changedPaths = (from: string, to: string) =>
        parseChangedPaths(git("diff", "--name-status", "-z", `${from}...${to}`));
      expect(classifyCiChanges(changedPaths(finalParent, head)).checks["cli-e2e"].selected).toBe(
        false,
      );

      const outputPath = path.join(directory, "selection-output");
      const execution = spawnSync("bash", ["-e", "-o", "pipefail", "-c", selector.run], {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...env,
          EVENT_NAME: "merge_group",
          QUEUE_BASE_SHA: base,
          QUEUE_HEAD_SHA: head,
          NX_BASE_SHA: finalParent,
          NX_HEAD_SHA: head,
          GITHUB_OUTPUT: outputPath,
        },
      });
      expect(execution.status, execution.stderr).toBe(0);
      const output = Object.fromEntries(
        fs
          .readFileSync(outputPath, "utf8")
          .trim()
          .split("\n")
          .map((line) => line.split("=")),
      );
      const selectedBase = output["base"];
      const selectedHead = output["head"];
      if (typeof selectedBase !== "string" || typeof selectedHead !== "string")
        throw new Error("Affected selection must publish both revisions.");
      expect({ selectedBase, selectedHead }).toEqual({ selectedBase: base, selectedHead: head });
      const selection = classifyCiChanges(changedPaths(selectedBase, selectedHead));
      expect(selection.code).toBe(true);
      expect(selection.documentation).toBe(true);
      expect(selection.checks["cli-e2e"].selected).toBe(true);
      expect(selection.checks.windows.selected).toBe(true);
      expect(requiredCiJobs(selection, "merge_group")).toEqual(
        expect.arrayContaining(["verify-pr", "verify-e2e", "windows-workspace", "binary-smoke"]),
      );
      for (const event of ["pull_request", "push"]) {
        const nonQueueOutput = path.join(directory, `${event}-output`);
        const nonQueue = spawnSync("bash", ["-e", "-o", "pipefail", "-c", selector.run], {
          cwd: directory,
          encoding: "utf8",
          env: {
            ...env,
            EVENT_NAME: event,
            QUEUE_BASE_SHA: "",
            QUEUE_HEAD_SHA: "",
            NX_BASE_SHA: finalParent,
            NX_HEAD_SHA: head,
            GITHUB_OUTPUT: nonQueueOutput,
          },
        });
        expect(nonQueue.status, nonQueue.stderr).toBe(0);
        expect(fs.readFileSync(nonQueueOutput, "utf8")).toBe(`base=${finalParent}\nhead=${head}\n`);
      }
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
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

  it("reports native fixture setup and strict cleanup failures together", async () => {
    const directory = fs.mkdtempSync(path.join(repoRoot, "node_modules", ".native-cleanup-"));
    const setupFile = path.join(directory, "setup.ts");
    fs.writeFileSync(
      setupFile,
      `import { vi } from "vitest";
      vi.mock("node:fs", async (importOriginal) => {
        const fs = await importOriginal();
        return {
          ...fs,
          mkdirSync() { throw new Error("native fixture setup failed"); },
          rmSync() { throw new Error("native fixture removal failed"); },
        };
      });`,
    );
    const vitest = await createVitest("test", {
      root: repoRoot,
      config: false,
      watch: false,
      reporters: [],
      include: ["apps/cli-e2e/src/binary-smoke.e2e.test.ts"],
      testNamePattern: "preserves native case aliases and remaining Skill consumers",
      setupFiles: [setupFile],
      env: { AXM_NATIVE_FIXTURE_PARENT: directory, AXM_BINARY_SOURCE: "compiled" },
      maxWorkers: 1,
    });
    try {
      const result = await vitest.start();
      expect(result.unhandledErrors).toEqual([]);
      const failures = result.testModules.flatMap((module) =>
        [...module.children.allTests("failed")].map((test) => test.result()),
      );
      expect(failures).toHaveLength(1);
      expect(failures.flatMap((result) => result.errors?.map((error) => error.message))).toEqual([
        "native fixture setup failed",
        "native fixture removal failed",
      ]);
    } finally {
      await vitest.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    { name: "normal detach", testStatus: 0, detachStatus: 0, forceStatus: 0, expected: 0 },
    {
      name: "container teardown failure after passing tests",
      testStatus: 0,
      detachStatus: 0,
      forceStatus: 0,
      containerStatus: 18,
      expected: 18,
    },
    {
      name: "test failure with container teardown failure",
      testStatus: 17,
      detachStatus: 0,
      forceStatus: 0,
      containerStatus: 18,
      expected: 17,
    },
    {
      name: "foreign physical store refuses container deletion and test execution",
      testStatus: 0,
      detachStatus: 0,
      forceStatus: 0,
      physicalStore: "disk420s1",
      expected: 1,
    },
    {
      name: "multiple physical stores refuse container deletion and test execution",
      testStatus: 0,
      detachStatus: 0,
      forceStatus: 0,
      storeCount: 2,
      expected: 1,
    },
    {
      name: "container identity mismatch refuses deletion and test execution",
      testStatus: 0,
      detachStatus: 0,
      forceStatus: 0,
      listedContainer: "disk0",
      expected: 1,
    },
    {
      name: "diagnostic failure does not prevent detach",
      testStatus: 0,
      detachStatus: 0,
      forceStatus: 0,
      deviceStatus: 9,
      lsofStatus: 2,
      expected: 0,
    },
    {
      name: "partial unmount then force success",
      testStatus: 0,
      detachStatus: 16,
      forceStatus: 0,
      expected: 0,
    },
    {
      name: "test failure with successful cleanup",
      testStatus: 17,
      detachStatus: 16,
      forceStatus: 0,
      expected: 17,
    },
    {
      name: "cleanup failure after passing tests",
      testStatus: 0,
      detachStatus: 16,
      forceStatus: 19,
      expected: 19,
    },
    {
      name: "test failure with cleanup failure",
      testStatus: 17,
      detachStatus: 16,
      forceStatus: 19,
      expected: 17,
    },
  ])("preserves APFS cleanup identity and exit status: $name", (scenario) => {
    const job = readWorkflow().jobs["binary-smoke"];
    if (typeof job !== "object" || job === null || !("steps" in job) || !Array.isArray(job.steps))
      throw new Error("Binary smoke must declare its native filesystem checks.");
    const step: unknown = job.steps.find(
      (candidate: unknown) =>
        typeof candidate === "object" &&
        candidate !== null &&
        "name" in candidate &&
        candidate.name === "Verify native lifecycle on case-sensitive APFS",
    );
    if (
      typeof step !== "object" ||
      step === null ||
      !("run" in step) ||
      typeof step.run !== "string"
    )
      throw new Error("APFS verification must execute a shell step.");
    const directory = fs.mkdtempSync(path.join(tmpdir(), "axm-apfs-cleanup-"));
    const attachPlist =
      '<?xml version="1.0"?><plist version="1.0"><dict><key>system-entities</key><array><dict><key>dev-entry</key><string>/dev/disk42</string></dict></array></dict></plist>';
    try {
      const execution = spawnSync(
        "bash",
        [
          "-e",
          "-o",
          "pipefail",
          "-c",
          `
        hdiutil() {
          case "$1" in
            create) return 0 ;;
            attach)
              if [[ " $* " == *" -plist "* ]]; then
                printf '%s\\n' "$ATTACH_PLIST"
              else
                printf '/dev/disk42 Apple_APFS\\n'
              fi
              ;;
            detach)
              [[ -f "$RUNNER_TEMP/diagnostics-complete" ]] || return 28
              if [[ "$IDENTITY_MATCH" == "true" ]]; then
                [[ -f "$RUNNER_TEMP/container-deletion" ]] || return 30
              fi
              printf '%s\\n' "$*" >> "$RUNNER_TEMP/detach-calls"
              if [[ "$2" == "-force" ]]; then
                [[ "$3" == "/dev/disk42" ]] || return 21
                return "$FORCE_STATUS"
              fi
              [[ "$2" == "/dev/disk42" || "$2" == "$RUNNER_TEMP/axm-case-sensitive" ]] || return 22
              # A failed eject can already have removed the mount point.
              rm -rf "$RUNNER_TEMP/axm-case-sensitive"
              return "$DETACH_STATUS"
              ;;
          esac
        }
        plutil() {
          [[ "$1" == "-extract" && "$3" == "raw" ]] || return 23
          case "$2" in
            system-entities.0.dev-entry)
              printf '/dev/disk42\\n' ;;
            APFSContainerReference) printf 'disk43\\n' ;;
            Containers) printf '1\\n' ;;
            Containers.0.ContainerReference) printf '%s\\n' "$LISTED_CONTAINER" ;;
            Containers.0.PhysicalStores) printf '%s\\n' "$STORE_COUNT" ;;
            Containers.0.PhysicalStores.0.DeviceIdentifier) printf '%s\\n' "$PHYSICAL_STORE" ;;
            *) return 24 ;;
          esac
        }
        diskutil() {
          case "$*" in
            "info -plist $RUNNER_TEMP/axm-case-sensitive") printf '<plist/>\\n' ;;
            "apfs list -plist disk43") printf '<plist/>\\n' ;;
            "info /dev/disk42")
              printf '%s\\n' "$*" >> "$RUNNER_TEMP/device-diagnostics"
              return "$DEVICE_STATUS" ;;
            "apfs deleteContainer disk43")
              [[ "$IDENTITY_MATCH" == "true" ]] || return 31
              printf '%s\\n' "$*" >> "$RUNNER_TEMP/container-deletion"
              return "$CONTAINER_STATUS" ;;
            *) return 27 ;;
          esac
        }
        lsof() {
          [[ "$*" == "-nP +f -- $RUNNER_TEMP/axm-case-sensitive" ]] || return 29
          touch "$RUNNER_TEMP/diagnostics-complete"
          return "$LSOF_STATUS"
        }
        pnpm() {
          [[ "$IDENTITY_MATCH" == "true" ]] || return 32
          touch "$RUNNER_TEMP/test-executed"
          [[ "$TMPDIR" == "$RUNNER_TEMP/runtime-temp" ]] || return 25
          [[ "$AXM_NATIVE_FIXTURE_PARENT" == "$RUNNER_TEMP/axm-case-sensitive" ]] || return 26
          return "$TEST_STATUS"
        }
        ${step.run}
      `,
        ],
        {
          cwd: directory,
          encoding: "utf8",
          env: {
            ...process.env,
            RUNNER_TEMP: directory,
            TMPDIR: path.join(directory, "runtime-temp"),
            ATTACH_PLIST: attachPlist,
            TEST_STATUS: String(scenario.testStatus),
            DETACH_STATUS: String(scenario.detachStatus),
            FORCE_STATUS: String(scenario.forceStatus),
            DEVICE_STATUS: String(scenario.deviceStatus ?? 0),
            LSOF_STATUS: String(scenario.lsofStatus ?? 1),
            CONTAINER_STATUS: String(scenario.containerStatus ?? 0),
            PHYSICAL_STORE: scenario.physicalStore ?? "disk42s1",
            STORE_COUNT: String(scenario.storeCount ?? 1),
            LISTED_CONTAINER: scenario.listedContainer ?? "disk43",
            IDENTITY_MATCH: String(
              scenario.physicalStore === undefined &&
                scenario.storeCount === undefined &&
                scenario.listedContainer === undefined,
            ),
          },
        },
      );
      expect(execution.status, execution.stdout + execution.stderr).toBe(scenario.expected);
      const identityMatches =
        scenario.physicalStore === undefined &&
        scenario.storeCount === undefined &&
        scenario.listedContainer === undefined;
      expect(fs.existsSync(path.join(directory, "test-executed"))).toBe(identityMatches);
      expect(fs.existsSync(path.join(directory, "container-deletion"))).toBe(identityMatches);
      if (identityMatches) {
        expect(fs.readFileSync(path.join(directory, "container-deletion"), "utf8")).toBe(
          "apfs deleteContainer disk43\n",
        );
      } else {
        expect(execution.stdout).toContain(
          "Refusing APFS container deletion without verified image ownership.",
        );
      }
      expect(fs.readFileSync(path.join(directory, "device-diagnostics"), "utf8")).toBe(
        "info /dev/disk42\n",
      );
      expect(execution.stdout).toContain(
        `Mount open-file inspection status: ${scenario.lsofStatus ?? 1}`,
      );
      if (scenario.deviceStatus !== undefined)
        expect(execution.stdout).toContain(
          "::warning::Could not inspect the attached APFS device.",
        );
      expect(fs.readFileSync(path.join(directory, "detach-calls"), "utf8")).toBe(
        scenario.detachStatus === 0
          ? "detach /dev/disk42\n"
          : "detach /dev/disk42\ndetach -force /dev/disk42\n",
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("native cache setup trust and configuration", () => {
  it("forwards repository bypass for every configured cache consumer and producer", () => {
    const directory = path.join(repoRoot, ".github/workflows");
    for (const filename of fs.readdirSync(directory).filter((name) => name.endsWith(".yml"))) {
      const workflow: unknown = YAML.parse(fs.readFileSync(path.join(directory, filename), "utf8"));
      if (typeof workflow !== "object" || workflow === null || !("jobs" in workflow))
        throw new Error(`Missing workflow jobs: ${filename}`);
      const jobs = workflow.jobs;
      if (typeof jobs !== "object" || jobs === null)
        throw new Error(`Invalid workflow jobs: ${filename}`);
      for (const candidateJob of Object.values(jobs)) {
        const job: unknown = candidateJob;
        if (
          typeof job !== "object" ||
          job === null ||
          !("steps" in job) ||
          !Array.isArray(job.steps)
        )
          continue;
        for (const candidateStep of job.steps) {
          const step: unknown = candidateStep;
          if (
            typeof step !== "object" ||
            step === null ||
            !("uses" in step) ||
            step.uses !== "./.github/actions/setup-workspace"
          )
            continue;
          if (
            !("with" in step) ||
            typeof step.with !== "object" ||
            step.with === null ||
            !("remote-cache-url" in step.with)
          )
            continue;
          expect(step.with, filename).toHaveProperty(
            "remote-cache-bypass",
            "${{ vars.NX_SKIP_REMOTE_CACHE }}",
          );
        }
      }
    }
  });
  const scenarios = [
    { name: "unconfigured", url: "", token: "", code: 0, enabled: false },
    {
      name: "reader",
      repositoryBypass: "false",
      url: "https://cache.example.test/",
      token: "fixture-reader",
      code: 0,
      enabled: true,
    },
    {
      name: "URL without credential",
      repositoryBypass: "false",
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
      name: "repository bypass without credential",
      url: "https://cache.example.test",
      token: "",
      repositoryBypass: "true",
      code: 0,
      enabled: false,
    },
    {
      name: "repository bypass with credential",
      url: "https://cache.example.test",
      token: "fixture-reader",
      repositoryBypass: "true",
      code: 0,
      enabled: false,
    },
    {
      name: "invalid repository bypass",
      url: "https://cache.example.test",
      token: "fixture-reader",
      repositoryBypass: "tru",
      code: 1,
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
      expect(step).toHaveProperty("env.CACHE_BYPASS", "${{ inputs.remote-cache-bypass }}");
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
            CACHE_BYPASS: "repositoryBypass" in scenario ? scenario.repositoryBypass : "",
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
      expect(workflow).toMatchObject({ on: { workflow_run: { branches: ["main"] } } });
      expect(warm).toHaveProperty("environment", "nx-cache-writer");
      for (const guard of [
        "github.event.workflow_run.conclusion == 'success'",
        "github.event.workflow_run.head_branch == 'main'",
        "github.event.workflow_run.head_repository.full_name == github.repository",
        "vars.NX_SKIP_REMOTE_CACHE != 'true'",
      ])
        expect(warm).toHaveProperty("if", expect.stringContaining(guard));
      const checkout: unknown = warm.steps.find(
        (candidate: unknown) =>
          typeof candidate === "object" &&
          candidate !== null &&
          "name" in candidate &&
          candidate.name === "Checkout verified main revision",
      );
      expect(checkout).toHaveProperty("with.ref", "${{ github.event.workflow_run.head_sha }}");
      expect(checkout).toHaveProperty("with.persist-credentials", false);
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
