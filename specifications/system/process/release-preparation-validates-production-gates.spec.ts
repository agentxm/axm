import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "system/process/release-preparation-validates-production-gates",
  title: "Release preparation validates production Registry gates without distribution",
  statement:
    "Release preparation shall preflight the production Registry before allocating candidate state and shall validate the exact generated candidate against the production Registry in preview-only mode, never applying a publication.",
  class: "process",
  role: "supporting",
  goals: ["dependable-change-process", "trustworthy-distribution"],
  status: "accepted",
  boundary: "repository",
  boundaryRationale:
    "Only the committed release scripts show the preflight order, the production Registry address, and the preview-only publication arguments.",
  methods: ["contract", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "A preview publication against the production Registry reports the same gate outcomes a real publication would enforce.",
  ],
  openQuestions: [],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

describe("Release preparation Registry gates", () => {
  it.effect("preflights the production Registry before allocating candidate state", () =>
    Effect.sync(() => {
      const orchestration = fs.readFileSync(
        path.join(repoRoot, "scripts", "release-prepare-orchestration.ts"),
        "utf8",
      );
      expect(orchestration.indexOf("host.preflightRegistry()")).toBeGreaterThan(-1);
      expect(orchestration.indexOf("host.preflightRegistry()")).toBeLessThan(
        orchestration.indexOf("host.allocateCandidateWorkspace()"),
      );
    }),
  );

  it.effect("uses preview-only publication against the production Registry", () =>
    Effect.sync(() => {
      const shared = fs.readFileSync(path.join(repoRoot, "scripts", "release-shared.ts"), "utf8");
      expect(shared).toContain('PRODUCTION_REGISTRY_URL = "https://registry.agentxm.ai"');
      expect(shared).toContain('"--on-existing"');
      expect(shared).toContain('"verify"');
      expect(shared).toContain('"--preview"');
      expect(shared).not.toContain('"--apply"');
    }),
  );

  it.effect("previews the exact generated candidate before delivery", () =>
    Effect.sync(() => {
      const candidate = fs.readFileSync(
        path.join(repoRoot, "scripts", "release-prepare-candidate.ts"),
        "utf8",
      );
      expect(candidate.indexOf("writeSkillVersion(version)")).toBeGreaterThan(-1);
      expect(candidate.lastIndexOf("PRODUCTION_REGISTRY_PREVIEW_ARGS")).toBeGreaterThan(
        candidate.indexOf("writeSkillVersion(version)"),
      );
    }),
  );
});
