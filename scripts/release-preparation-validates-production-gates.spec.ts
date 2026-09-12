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
import { selectReleasedSkillTag, validateReleasePreparationSource } from "./release-preflight.js";
import {
  AXM_SKILL_HANDLE,
  PRODUCTION_REGISTRY_URL,
  productionRegistryPreviewArgs,
} from "./release-shared.js";

export const specification = defineSpecification({
  requirement: "system/process/release-preparation-validates-production-gates",
  title: "Release preparation validates production Registry gates without distribution",
  statement:
    "An explicitly dispatched GitHub Actions preparation shall bind an exact current main revision, preflight the production Registry from the latest reachable released CLI at or before the current version before generating candidate state, validate the exact generated candidate in preview-only mode, and open a reviewable candidate pull request whose exact commit receives Required CI without applying a publication.",
  class: "process",
  role: "supporting",
  goals: ["dependable-change-process", "trustworthy-distribution"],
  boundary: "repository",
  boundaryRationale:
    "The committed preparation workflow, source resolver, candidate orchestration, and CI dispatch declare the ordering, provenance, credentials, and verification path without requiring a developer checkout.",
  methods: ["example", "contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "A preview publication against the production Registry reports the same gate outcomes a real publication would enforce.",
    "Repository Actions policy permits the preparation job's declared contents, pull-request, and workflow-dispatch permissions.",
    "Release tags are created only by the canonical GitHub Release workflow.",
  ],
  openQuestions: [],
});

export const boundEvidence = defineBoundEvidence([
  {
    gate: "test: axm:test (scripts/release-preparation-validates-production-gates.spec.ts)",
    verifies:
      "Checks explicit dispatch, exact-source and stale-main guards, released-skill and exact-candidate Registry previews, reviewable pull-request creation, and explicit Required CI dispatch for the candidate commit.",
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
    generateSkill: () => events.push("generate"),
    previewRegistry: () => events.push("exact-preview"),
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

  it.effect("preflights the released skill before generating the exact candidate", () =>
    Effect.sync(() => {
      const names = readWorkflow().steps.map((step) => Reflect.get(step, "name"));
      const releasedPreview = names.indexOf("Preflight production Registry from released skill");
      const candidate = names.indexOf("Generate and validate exact candidate");
      const refresh = names.indexOf("Refresh installed workspace after versioning");
      const commit = names.indexOf("Commit candidate");
      expect(releasedPreview).toBeGreaterThan(-1);
      expect(candidate).toBeGreaterThan(releasedPreview);
      expect(names.indexOf("Remove released skill preflight checkout")).toBeGreaterThan(
        releasedPreview,
      );
      expect(names.indexOf("Remove released skill preflight checkout")).toBeLessThan(candidate);
      expect(refresh).toBeGreaterThan(candidate);
      expect(commit).toBeGreaterThan(refresh);
      expect(
        JSON.stringify(
          namedStep(readWorkflow().steps, "Refresh installed workspace after versioning"),
        ),
      ).toContain("pnpm install --frozen-lockfile");
    }),
  );

  it.effect("opens a pull request and explicitly dispatches Required CI", () =>
    Effect.sync(() => {
      const workflow = readWorkflow();
      expect(workflow.permissions).toMatchObject({
        actions: "write",
        contents: "write",
        "pull-requests": "write",
      });
      const pullRequest = namedStep(workflow.steps, "Open release pull request");
      const dispatch = namedStep(workflow.steps, "Dispatch Required CI for candidate commit");
      expect(JSON.stringify(pullRequest)).toContain("gh pr create");
      expect(JSON.stringify(pullRequest)).toContain("${{ github.token }}");
      expect(JSON.stringify(dispatch)).toContain("gh workflow run ci.yml");
      expect(JSON.stringify(dispatch)).toContain("--field runner=github-hosted");
      expect(workflow.steps.indexOf(dispatch)).toBeGreaterThan(workflow.steps.indexOf(pullRequest));
    }),
  );
});

describe("Release preparation Registry gates", () => {
  it.effect("falls back to the prior release when the current candidate was not published", () =>
    Effect.sync(() => {
      expect(selectReleasedSkillTag("0.29.3", ["cli-v0.29.1", "cli-v0.29.2"])).toBe("cli-v0.29.2");
    }),
  );

  it.effect("previews the exact candidate only after it has been generated", () =>
    Effect.promise(async () => {
      const { events, host } = recordingCandidateHost();
      await runReleaseCandidatePreparation(host);
      expect(events).toEqual([
        "version",
        "changelog",
        "stamp",
        "generate",
        "exact-preview",
        "validate",
      ]);
    }),
  );

  it.effect("the preview targets production and can never apply publication", () =>
    Effect.sync(() => {
      for (const preview of [
        productionRegistryPreviewArgs(),
        productionRegistryPreviewArgs("/tmp/axm-released"),
      ]) {
        expect(preview).toContain(AXM_SKILL_HANDLE);
        expect(preview[preview.indexOf("--registry-url") + 1]).toBe(PRODUCTION_REGISTRY_URL);
        expect(preview).toContain("--preview");
        expect(
          preview.slice(preview.indexOf("--on-existing"), preview.indexOf("--on-existing") + 2),
        ).toEqual(["--on-existing", "verify"]);
        for (const applying of ["--yes", "-y", "--force", "--backfill"]) {
          expect(preview).not.toContain(applying);
        }
      }
    }),
  );
});
