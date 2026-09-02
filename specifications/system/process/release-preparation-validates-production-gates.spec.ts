import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "../../support/contract.js";

export const specification = defineSpecification({
  requirement: "system/process/release-preparation-validates-production-gates",
  title: "Release preparation validates production Registry gates without distribution",
  class: "process",
  role: "supporting",
  goals: ["dependable-change-process", "trustworthy-distribution"],
  boundary: "repository",
  methods: ["contract", "decision-table"],
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
