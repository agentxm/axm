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
  });
});
