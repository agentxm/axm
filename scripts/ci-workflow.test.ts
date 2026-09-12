/**
 * The aggregate verification gate: continuous integration runs on every pull
 * request, and one always-run `required` job aggregates every other job so a
 * skipped or failed check can never disappear from the verdict.
 *
 * Supersedes the retired specification identity
 * `system/process/merges-require-aggregate-verification`
 * (see `specifications/disposition-ledger.json`). Branch protection itself is
 * host-side; what the repository declares is this workflow shape.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import YAML from "yaml";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

const readWorkflow = (): {
  readonly jobs: Readonly<Record<string, unknown>>;
  readonly on: unknown;
} => {
  const parsed: unknown = YAML.parse(
    fs.readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8"),
  );
  if (typeof parsed !== "object" || parsed === null || !("jobs" in parsed)) {
    throw new Error("ci.yml must declare jobs");
  }
  const jobs = parsed.jobs;
  if (typeof jobs !== "object" || jobs === null) {
    throw new Error("ci.yml jobs must be a mapping");
  }
  // YAML parses the `on:` trigger key as boolean true.
  const triggers =
    "on" in parsed ? parsed.on : (Object.fromEntries(Object.entries(parsed))["true"] ?? undefined);
  return { jobs: Object.fromEntries(Object.entries(jobs)), on: triggers };
};

describe("aggregate required verification", () => {
  it("continuous integration runs for every pull request", () => {
    expect(JSON.stringify(readWorkflow().on)).toContain("pull_request");
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
  });

  it("derives one broad-fallback affected range for PR classification and verification", () => {
    const workflow = readWorkflow();
    const serialized = JSON.stringify(workflow.jobs["classify"]);
    expect(serialized).toContain("nrwl/nx-set-shas@afb73a62d26e41464e9254689e1fd6122ee683c1");
    expect(serialized).toContain("git rev-list --max-parents=0 HEAD");
    expect(serialized).toContain("steps.set-shas.outputs.base");
    expect(serialized).toContain("steps.set-shas.outputs.head");
  });

  it("runs the complete CI workflow through the report-preserving wrapper on hosted runners", () => {
    const hosted = JSON.stringify(readWorkflow().jobs["verify-main-hosted"]);
    expect(hosted).toContain("scripts/with-allure-report.sh pnpm run ci");
    expect(hosted).not.toContain("pnpm run ci:report");
  });
});
