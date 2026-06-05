/**
 * Unit tests for the skills prune handler.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";
import { handlePrune } from "./handler.js";
import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  makeWorkspaceHandlerTestContext,
  planResultSteps,
} from "../../../test-helpers.js";

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

describe("skills.prune.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), "prune-handler-test-"));
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
  // Unmanaged skills removed
  // -----------------------------------------------------------------------

  describe("unmanaged skills removed", () => {
    it.effect("removes unmanaged skill artifact directories with --yes", () => {
      const { provide, logs } = makeLayers();
      createSkillOnDisk(tempDir, ".claude", "legacy-tool");

      return provide(
        Effect.gen(function* () {
          yield* handlePrune({ patterns: [] }, { yes: true });

          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "legacy-tool"))).toBe(
            false,
          );
          expect(logs.success.some((m) => m.includes("Pruned"))).toBe(true);
        }),
      );
    });

    it.effect("removes multiple unmanaged skill artifacts with --yes", () => {
      const { provide } = makeLayers();
      createSkillOnDisk(tempDir, ".claude", "legacy-tool");
      createSkillOnDisk(tempDir, ".claude", "old-helper");

      return provide(
        Effect.gen(function* () {
          yield* handlePrune({ patterns: [] }, { yes: true });

          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "legacy-tool"))).toBe(
            false,
          );
          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "old-helper"))).toBe(
            false,
          );
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Configured/implicit/ignored not pruned
  // -----------------------------------------------------------------------

  describe("configured and ignored skills not pruned", () => {
    it.effect("does not prune configured skills", () => {
      const { provide } = makeLayers();
      // Create a skill that IS in settings (configured)
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
          yield* handlePrune({ patterns: [] }, { yes: true });

          // my-skill is configured, so it should NOT be removed
          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "my-skill"))).toBe(true);
        }),
      );
    });

    it.effect("does not prune ignored skills", () => {
      const { provide } = makeLayers();
      const axmDir = nodePath.join(tempDir, ".axm");
      fs.mkdirSync(axmDir, { recursive: true });
      fs.writeFileSync(
        nodePath.join(axmDir, "settings.json"),
        JSON.stringify({
          agents: ["claude-code"],
          skillsConfig: { ignore: ["internal-*"] },
        }),
      );
      fs.writeFileSync(nodePath.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");
      createSkillOnDisk(tempDir, ".claude", "internal-tool");
      createSkillOnDisk(tempDir, ".claude", "legacy-tool");

      return provide(
        Effect.gen(function* () {
          yield* handlePrune({ patterns: [] }, { yes: true });

          // internal-tool is ignored, should NOT be removed
          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "internal-tool"))).toBe(
            true,
          );
          // legacy-tool is unmanaged, should be removed
          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "legacy-tool"))).toBe(
            false,
          );
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Glob pattern filtering
  // -----------------------------------------------------------------------

  describe("glob pattern filtering", () => {
    it.effect("filters by glob pattern", () => {
      const { provide } = makeLayers();
      createSkillOnDisk(tempDir, ".claude", "effect-basics");
      createSkillOnDisk(tempDir, ".claude", "effect-layers");
      createSkillOnDisk(tempDir, ".claude", "legacy-tool");

      return provide(
        Effect.gen(function* () {
          yield* handlePrune({ patterns: ["effect-*"] }, { yes: true });

          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "effect-basics"))).toBe(
            false,
          );
          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "effect-layers"))).toBe(
            false,
          );
          // legacy-tool does not match pattern, should remain
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
          yield* handlePrune({ patterns: ["effect-*", "legacy-*"] }, { yes: true });

          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "effect-basics"))).toBe(
            false,
          );
          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "legacy-tool"))).toBe(
            false,
          );
          // old-helper does not match, should remain
          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "old-helper"))).toBe(
            true,
          );
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // No unmanaged artifacts
  // -----------------------------------------------------------------------

  describe("nothing to prune", () => {
    it.effect("reports clean state when no unmanaged skills exist", () => {
      const { provide, logs } = makeLayers();

      return provide(
        Effect.gen(function* () {
          yield* handlePrune({ patterns: [] }, { yes: true });

          expect(logs.success).toEqual(["No unmanaged skill artifacts pruned."]);
        }),
      );
    });

    it.effect("reports clean state when patterns match no unmanaged skills", () => {
      const { provide, logs } = makeLayers();
      createSkillOnDisk(tempDir, ".claude", "legacy-tool");

      return provide(
        Effect.gen(function* () {
          yield* handlePrune({ patterns: ["nonexistent-*"] }, { yes: true });

          expect(logs.success).toEqual(["No unmanaged skill artifacts pruned."]);
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // --yes bypasses confirmation
  // -----------------------------------------------------------------------

  describe("--yes flag", () => {
    it.effect("without --yes shows preview without deleting", () => {
      const { provide, logs } = makeLayers();
      createSkillOnDisk(tempDir, ".claude", "legacy-tool");

      return provide(
        Effect.gen(function* () {
          yield* handlePrune({ patterns: [] }, { yes: false });

          // Should show info about running with --yes
          expect(logs.info.some((m) => m.includes("--yes"))).toBe(true);
          // Should NOT delete
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
          yield* handlePrune({ patterns: [] }, { yes: true });

          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "legacy-tool"))).toBe(
            false,
          );
          expect(logs.success.some((m) => m.includes("Pruned"))).toBe(true);
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // --json output (machine renderer mode)
  // -----------------------------------------------------------------------

  describe("--json output", () => {
    it.effect("--json alone previews a prune plan without deletion", () => {
      const { provide, rendererState } = makeLayers({ machine: true });
      createSkillOnDisk(tempDir, ".claude", "legacy-tool");

      return provide(
        Effect.gen(function* () {
          yield* handlePrune({ patterns: [] }, { yes: false });

          // Should NOT delete
          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "legacy-tool"))).toBe(
            true,
          );

          expect(rendererState.results.length).toBe(1);
          const result = expectPreviewedPlanResult(rendererState.results[0]?.data, {
            planName: "Prune skill artifacts",
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
          yield* handlePrune({ patterns: [] }, { yes: true });

          // Should delete
          expect(fs.existsSync(nodePath.join(tempDir, ".claude", "skills", "legacy-tool"))).toBe(
            false,
          );

          expect(rendererState.results.length).toBe(1);
          const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
            planName: "Prune skill artifacts",
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
          yield* handlePrune({ patterns: [] }, { yes: false });

          expect(rendererState.results.length).toBe(1);
          const result = rendererState.results[0];
          expect(result).toBeDefined();
          expectNoOpPlanResult(result?.data, {
            planName: "Prune skill artifacts",
            message: "No unmanaged skill artifacts pruned.",
          });
        }),
      );
    });
  });
});
