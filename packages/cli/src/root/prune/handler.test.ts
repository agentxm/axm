/**
 * Unit tests for the root prune handler.
 *
 * Verifies that `axm prune` aggregates across extension types (skills-only
 * in v1), applies glob pattern filtering, and supports the same confirmation
 * UX and JSON output modes as `axm skills prune`.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";
import { handleRootPrune } from "./handler.js";
import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  makeWorkspaceHandlerTestContext,
  planResultSteps,
} from "../../test-helpers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a skill directory on disk (detected as unmanaged when not in settings). */
const createSkillOnDisk = (baseDir: string, agentDir: string, name: string) => {
  const skillDir = nodePath.join(baseDir, agentDir, "skills", name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    nodePath.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: Test skill ${name}\n---\n\n# ${name}\n`,
  );
  return skillDir;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("root.prune.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), "root-prune-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: { machine?: boolean }) => {
    const handlerTestContext = makeWorkspaceHandlerTestContext({ machine: opts?.machine });
    return {
      provide: handlerTestContext.provide,
      logs: handlerTestContext.logs,
      rendererState: handlerTestContext.rendererState,
    };
  };

  // -----------------------------------------------------------------------
  // Aggregation across types (skills-only in v1)
  // -----------------------------------------------------------------------

  describe("aggregation across types", () => {
    it.effect("aggregates skills artifacts (only type in v1)", () => {
      const { provide, logs } = makeLayers();
      createSkillOnDisk(tempDir, ".claude", "legacy-tool");
      createSkillOnDisk(tempDir, ".claude", "old-helper");

      return provide(
        Effect.gen(function* () {
          yield* handleRootPrune({ patterns: [] }, { yes: true });

          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "legacy-tool"))).toBe(
            false,
          );
          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "old-helper"))).toBe(
            false,
          );
          expect(logs.success.some((m) => m.includes("Pruned"))).toBe(true);
        }),
      );
    });

    it.effect("does not prune configured skills", () => {
      const { provide } = makeLayers();
      const axmDir = nodePath.join(tempDir, ".axm");
      fs.mkdirSync(axmDir, { recursive: true });
      fs.writeFileSync(
        nodePath.join(axmDir, "settings.json"),
        JSON.stringify({
          agents: ["claude-code"],
          skills: { "my-skill": "local:/some/path" },
        }),
      );
      fs.writeFileSync(nodePath.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");
      createSkillOnDisk(tempDir, ".claude", "my-skill");

      return provide(
        Effect.gen(function* () {
          yield* handleRootPrune({ patterns: [] }, { yes: true });

          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "my-skill"))).toBe(true);
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Patterns applied across types
  // -----------------------------------------------------------------------

  describe("patterns applied across types", () => {
    it.effect("filters by glob pattern", () => {
      const { provide } = makeLayers();
      createSkillOnDisk(tempDir, ".claude", "effect-basics");
      createSkillOnDisk(tempDir, ".claude", "effect-layers");
      createSkillOnDisk(tempDir, ".claude", "legacy-tool");

      return provide(
        Effect.gen(function* () {
          yield* handleRootPrune({ patterns: ["effect-*"] }, { yes: true });

          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "effect-basics"))).toBe(
            false,
          );
          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "effect-layers"))).toBe(
            false,
          );
          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "legacy-tool"))).toBe(
            true,
          );
        }),
      );
    });

    it.effect("supports multiple patterns", () => {
      const { provide } = makeLayers();
      createSkillOnDisk(tempDir, ".claude", "effect-basics");
      createSkillOnDisk(tempDir, ".claude", "legacy-tool");
      createSkillOnDisk(tempDir, ".claude", "old-helper");

      return provide(
        Effect.gen(function* () {
          yield* handleRootPrune({ patterns: ["effect-*", "legacy-*"] }, { yes: true });

          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "effect-basics"))).toBe(
            false,
          );
          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "legacy-tool"))).toBe(
            false,
          );
          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "old-helper"))).toBe(
            true,
          );
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Confirmation UX
  // -----------------------------------------------------------------------

  describe("confirmation UX", () => {
    it.effect("without --yes shows preview without deleting", () => {
      const { provide, logs } = makeLayers();
      createSkillOnDisk(tempDir, ".claude", "legacy-tool");

      return provide(
        Effect.gen(function* () {
          yield* handleRootPrune({ patterns: [] }, { yes: false });

          expect(logs.info.some((m) => m.includes("--yes"))).toBe(true);
          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "legacy-tool"))).toBe(
            true,
          );
        }),
      );
    });

    it.effect("with --yes removes without prompting", () => {
      const { provide, logs } = makeLayers();
      createSkillOnDisk(tempDir, ".claude", "legacy-tool");

      return provide(
        Effect.gen(function* () {
          yield* handleRootPrune({ patterns: [] }, { yes: true });

          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "legacy-tool"))).toBe(
            false,
          );
          expect(logs.success.some((m) => m.includes("Pruned"))).toBe(true);
        }),
      );
    });

    it.effect("reports clean state when nothing to prune", () => {
      const { provide, logs } = makeLayers();

      return provide(
        Effect.gen(function* () {
          yield* handleRootPrune({ patterns: [] }, { yes: true });

          expect(logs.success).toEqual(["No unmanaged artifacts pruned."]);
        }),
      );
    });

    it.effect("reports clean state when patterns match nothing", () => {
      const { provide, logs } = makeLayers();
      createSkillOnDisk(tempDir, ".claude", "legacy-tool");

      return provide(
        Effect.gen(function* () {
          yield* handleRootPrune({ patterns: ["nonexistent-*"] }, { yes: true });

          expect(logs.success).toEqual(["No unmanaged artifacts pruned."]);
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // JSON output
  // -----------------------------------------------------------------------

  describe("JSON output", () => {
    it.effect("--json alone previews a prune plan without deletion", () => {
      const { provide, rendererState } = makeLayers({ machine: true });
      createSkillOnDisk(tempDir, ".claude", "legacy-tool");

      return provide(
        Effect.gen(function* () {
          yield* handleRootPrune({ patterns: [] }, { yes: false });

          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "legacy-tool"))).toBe(
            true,
          );

          expect(rendererState.results.length).toBe(1);
          const result = expectPreviewedPlanResult(rendererState.results[0]?.data, {
            planName: "Prune artifacts",
            totalSteps: 1,
          });
          expect(planResultSteps(result)).toEqual([
            expect.objectContaining({ label: "legacy-tool", status: "ready" }),
          ]);
        }),
      );
    });

    it.effect("--yes --json prunes and reports a plan result", () => {
      const { provide, rendererState } = makeLayers({ machine: true });
      createSkillOnDisk(tempDir, ".claude", "legacy-tool");

      return provide(
        Effect.gen(function* () {
          yield* handleRootPrune({ patterns: [] }, { yes: true });

          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "legacy-tool"))).toBe(
            false,
          );

          expect(rendererState.results.length).toBe(1);
          const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
            planName: "Prune artifacts",
          });
          expect(result).toMatchObject({
            steps: [
              {
                label: "legacy-tool",
                status: "applied",
                artifact: {
                  path: ".claude/skills/legacy-tool",
                  scope: "project",
                  change: "removed",
                },
              },
            ],
          });
        }),
      );
    });

    it.effect("--json with nothing to prune outputs no-op result", () => {
      const { provide, rendererState } = makeLayers({ machine: true });

      return provide(
        Effect.gen(function* () {
          yield* handleRootPrune({ patterns: [] }, { yes: false });

          expect(rendererState.results.length).toBe(1);
          const result = rendererState.results[0];
          expect(result).toBeDefined();
          expectNoOpPlanResult(result?.data, {
            planName: "Prune artifacts",
            message: "No unmanaged artifacts pruned.",
          });
        }),
      );
    });
  });
});
