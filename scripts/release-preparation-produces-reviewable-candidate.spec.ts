import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import YAML from "yaml";

import { defineBoundEvidence, defineSpecification } from "@agentxm/specification-metadata";

import {
  type ReleaseCandidateHost,
  runReleaseCandidatePreparation,
} from "./release-prepare-candidate-orchestration.js";
import { validateReleasePreparationSource } from "./release-preflight.js";

export const specification = defineSpecification({
  requirement: "system/process/release-preparation-produces-reviewable-candidate",
  title: "Release preparation produces an exact reviewable candidate",
  statement:
    "An explicitly dispatched GitHub Actions preparation shall bind an exact current main revision, generate all version-derived release content and validate the candidate without contacting a private service, and open a reviewable candidate pull request whose exact commit receives Required CI without applying a publication.",
  class: "process",
  role: "supporting",
  goals: ["dependable-change-process", "trustworthy-distribution"],
  boundary: "repository",
  boundaryRationale:
    "The committed preparation workflow, source resolver, candidate orchestration, and approved PR workflow declare the ordering, provenance, and verification path without requiring a developer checkout.",
  methods: ["example", "contract"],
  derivedFrom: ["system/process/release-preparation-validates-production-gates"],
  supersedes: ["system/process/release-preparation-validates-production-gates"],
  assumptions: [
    "Repository Actions policy permits the preparation job's contents and pull-request permissions, and a release maintainer can approve the prepared PR workflow.",
  ],
  openQuestions: [],
});

export const boundEvidence = defineBoundEvidence([
  {
    gate: "test: axm:test (scripts/release-preparation-produces-reviewable-candidate.spec.ts)",
    verifies:
      "Checks explicit preparation dispatch, exact-source and stale-main guards, private-service independence, version-derived skill and CLI-reference generation order, reviewable pull-request creation, and the declared PR verification path for the candidate commit.",
  },
  {
    gate: "test: axm:test (scripts/repository-task-interface.test.ts)",
    verifies:
      "Checks that local release-preparation orchestration has no root alias and that source resolution and candidate generation are fresh internal targets owned by the Actions workflow.",
  },
]);

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const workflowPath = path.join(repoRoot, ".github", "workflows", "prepare-release.yml");

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  value !== null && typeof value === "object";

const readWorkflow = () => {
  const parsed: unknown = YAML.parse(fs.readFileSync(workflowPath, "utf8"));
  if (!isRecord(parsed)) throw new Error("prepare-release.yml must contain a mapping.");
  const triggers = Reflect.get(parsed, "on") ?? Object.fromEntries(Object.entries(parsed))["true"];
  const permissions = Reflect.get(parsed, "permissions");
  const jobs = Reflect.get(parsed, "jobs");
  if (!isRecord(triggers) || !isRecord(permissions) || !isRecord(jobs)) {
    throw new Error("prepare-release.yml must declare triggers, permissions, and jobs.");
  }
  const prepare = Reflect.get(jobs, "prepare");
  if (!isRecord(prepare)) throw new Error("prepare-release.yml must declare a prepare job.");
  const steps = Reflect.get(prepare, "steps");
  if (!Array.isArray(steps) || !steps.every(isRecord)) {
    throw new Error("The release preparation job must declare mapped steps.");
  }
  return { permissions, steps, triggers };
};

const namedStep = (steps: ReadonlyArray<Record<PropertyKey, unknown>>, name: string) => {
  const step = steps.find((candidate) => Reflect.get(candidate, "name") === name);
  if (step === undefined) throw new Error(`Missing workflow step: ${name}`);
  return step;
};

const recordingCandidateHost = () => {
  const events: string[] = [];
  const host: ReleaseCandidateHost<"version-context"> = {
    version: async () => {
      events.push("version");
      return { version: "1.2.3", context: "version-context" };
    },
    changelog: async () => {
      events.push("changelog");
    },
    stampSkill: () => events.push("stamp"),
    generateSkill: () => events.push("generate-skill"),
    generateCliReference: () => events.push("generate-cli-reference"),
    validateCohort: () => events.push("validate"),
  };
  return { events, host };
};

describe("Release preparation workflow", () => {
  it.effect("requires an explicit exact source revision", () =>
    Effect.sync(() => {
      const workflow = readWorkflow();
      expect(Object.keys(workflow.triggers)).toEqual(["workflow_dispatch"]);
      expect(JSON.stringify(workflow.triggers)).toContain('"source_sha":{"description"');
      expect(JSON.stringify(workflow.triggers)).toContain('"required":true');
      const checkout = namedStep(workflow.steps, "Checkout declared source");
      expect(JSON.stringify(checkout)).toContain("${{ inputs.source_sha }}");
    }),
  );

  it.effect("rejects symbolic, mismatched, and stale source revisions", () =>
    Effect.sync(() => {
      const source = "0123456789abcdef0123456789abcdef01234567";
      expect(() => validateReleasePreparationSource(source, source, source)).not.toThrow();
      expect(() => validateReleasePreparationSource("main", source, source)).toThrow();
      expect(() => validateReleasePreparationSource(source, "1".repeat(40), source)).toThrow();
      expect(() => validateReleasePreparationSource(source, source, "2".repeat(40))).toThrow();
      const push = namedStep(readWorkflow().steps, "Revalidate source and push candidate");
      const run = Reflect.get(push, "run");
      expect(run).toContain("git fetch origin main --no-tags");
      expect(run).toContain('[[ "$current_main" != "$SOURCE_SHA" ]]');
    }),
  );

  it.effect("generates and validates the candidate without private-service dependencies", () =>
    Effect.sync(() => {
      const workflow = readWorkflow();
      const names = workflow.steps.map((step) => Reflect.get(step, "name"));
      const source = names.indexOf("Resolve and validate preparation source");
      const candidate = names.indexOf("Generate and validate exact candidate");
      const refresh = names.indexOf("Refresh installed workspace after versioning");
      const commit = names.indexOf("Commit candidate");
      expect(source).toBeGreaterThan(-1);
      expect(candidate).toBeGreaterThan(source);
      expect(refresh).toBeGreaterThan(candidate);
      expect(commit).toBeGreaterThan(refresh);
      const serialized = JSON.stringify(workflow.steps);
      expect(serialized).not.toContain("secrets.");
      expect(serialized).not.toContain(["registry", "agentxm", "ai"].join("."));
      expect(
        JSON.stringify(
          namedStep(readWorkflow().steps, "Refresh installed workspace after versioning"),
        ),
      ).toContain("pnpm install --frozen-lockfile");
    }),
  );

  it.effect("opens a candidate for PR verification with repository-scoped authority", () =>
    Effect.sync(() => {
      const workflow = readWorkflow();
      expect(workflow.permissions).toEqual({
        contents: "write",
        "pull-requests": "write",
      });
      const pullRequest = namedStep(workflow.steps, "Open release pull request");
      expect(JSON.stringify(pullRequest)).toContain("gh pr create");
      expect(JSON.stringify(pullRequest)).toContain("${{ github.token }}");
      const ci: unknown = YAML.parse(
        fs.readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8"),
      );
      if (!isRecord(ci) || !isRecord(ci["on"])) throw new Error("CI must declare its triggers.");
      expect(ci["on"]).toHaveProperty("pull_request");
    }),
  );
  it.effect("validates the exact cohort only after it has been generated", () =>
    Effect.promise(async () => {
      const { events, host } = recordingCandidateHost();
      await runReleaseCandidatePreparation(host);
      expect(events).toEqual([
        "version",
        "changelog",
        "stamp",
        "generate-skill",
        "generate-cli-reference",
        "validate",
      ]);
    }),
  );
});
