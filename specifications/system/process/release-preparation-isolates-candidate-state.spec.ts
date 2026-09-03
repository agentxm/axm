import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "system/process/release-preparation-isolates-candidate-state",
  title: "Release preparation isolates candidate state until delivery",
  statement:
    "Release preparation shall generate candidate state in a disposable detached worktree with a frozen lockfile, deliver it only in a real run after confirming the invoking checkout is unchanged, and clean up every allocated candidate even when a step fails.",
  class: "process",
  role: "supporting",
  goals: ["dependable-change-process", "safe-repetition"],
  status: "accepted",
  boundary: "repository",
  boundaryRationale:
    "Only the committed release-preparation scripts and their tooling tests show how candidate state is allocated, delivered, and cleaned up.",
  methods: ["model", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const readScript = (name: string): string =>
  fs.readFileSync(path.join(repoRoot, "scripts", name), "utf8");

describe("Isolated release candidate state", () => {
  it.effect("creates candidate state in a disposable detached worktree", () =>
    Effect.sync(() => {
      const entrypoint = readScript("release-prepare.ts");
      expect(entrypoint).toContain('mkdtempSync(join(tmpdir(), "axm-release-prepare-"))');
      expect(entrypoint).toContain('["worktree", "add", "--detach"');
      expect(entrypoint).toContain('["install", "--frozen-lockfile"]');
      expect(entrypoint).not.toContain('["switch", "--create"');
    }),
  );

  it.effect("applies real candidate generation in both modes but delivers only real runs", () =>
    Effect.sync(() => {
      const candidate = readScript("release-prepare-candidate.ts");
      const orchestration = readScript("release-prepare-orchestration.ts");
      expect(candidate).toContain("dryRun: false");
      expect(orchestration.indexOf("if (dryRun)")).toBeLessThan(
        orchestration.indexOf("host.commitCandidate"),
      );
      expect(orchestration.indexOf("host.commitCandidate")).toBeLessThan(
        orchestration.indexOf("host.pushCandidate"),
      );
    }),
  );

  it.effect("checks the invoking checkout before push and cleans every allocated candidate", () =>
    Effect.sync(() => {
      const orchestration = readScript("release-prepare-orchestration.ts");
      expect(orchestration.indexOf("host.assertSourceUnchanged")).toBeLessThan(
        orchestration.indexOf("host.pushCandidate"),
      );
      expect(orchestration.indexOf("host.cleanupCandidateWorkspace")).toBeGreaterThan(
        orchestration.indexOf("catch (error)"),
      );

      const toolingTests = readScript("release-prepare.tooling.test.ts");
      expect(toolingTests).toContain("cleans the isolated checkout when %s fails");
      expect(toolingTests).toContain("preserves the primary failure when cleanup also fails");
    }),
  );
});
