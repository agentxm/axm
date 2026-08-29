import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import YAML from "yaml";

import { defineSpecification } from "../../support/contract.js";

export const specification = defineSpecification({
  requirement: "system/process/merges-require-aggregate-verification",
  title: "Changes are verified by one aggregate required check before merge",
  class: "process",
  intents: ["dependable-change-process"],
  boundary: "repository",
  methods: ["contract"],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

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

describe("Aggregate required verification", () => {
  it.effect("continuous integration runs for every pull request", () =>
    Effect.sync(() => {
      const workflow = readWorkflow();
      expect(JSON.stringify(workflow.on)).toContain("pull_request");
    }),
  );

  it.effect("one always-run aggregate job gates on every applicable check", () =>
    Effect.sync(() => {
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
      // Every other job in the workflow feeds the aggregate gate.
      const jobNames = Object.keys(workflow.jobs).filter((name) => name !== "required");
      for (const name of jobNames) {
        expect(needs).toContain(name);
      }
    }),
  );
});
