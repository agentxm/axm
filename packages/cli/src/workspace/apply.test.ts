/**
 * Tests for applyPlan and applyStep - executing or displaying reconciliation plans.
 *
 * Tests cover:
 * - applyPlan: Overall plan execution, dry-run, progress callbacks
 * - applyStep: Individual step implementations (Install, Update, Uninstall)
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as os from "node:os";
import * as nodePath from "node:path";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Plan, PlanStep, SkillSourceV2 } from "../extensions/skills/state/types.js";
import { PlanStep as PlanStepConstructor } from "../extensions/skills/state/types.js";
import {
  type ApplyDeps,
  ApplyError,
  type ApplyOptions,
  applyPlan,
  applyStep,
  displayPlan,
  emptyApplyResult,
} from "./apply.js";
// =============================================================================
// Test Helpers
// =============================================================================

const makeLocalSource = (path: string): SkillSourceV2 => ({
  _tag: "Local",
  path,
});

const makeInstallStep = (name: string, agents: string[] = ["claude"]): PlanStep =>
  PlanStepConstructor.InstallSkill({
    skill: name,
    source: makeLocalSource("/path/to/source"),
    version: Option.some("1.0.0"),
    gitTreeHash: Option.some("abc123"),
    agents,
  });

const makeUpdateStep = (name: string, agents: string[] = ["claude"]): PlanStep =>
  PlanStepConstructor.UpdateSkill({
    skill: name,
    source: makeLocalSource("/path/to/source"),
    fromVersion: Option.some("1.0.0"),
    toVersion: Option.some("2.0.0"),
    fromHash: Option.some("abc123"),
    toHash: Option.some("def456"),
    agents,
  });

const makeUninstallStep = (name: string, agents: string[] = ["claude"]): PlanStep =>
  PlanStepConstructor.UninstallSkill({
    skill: name,
    agents,
  });

const makePlan = (steps: PlanStep[]): Plan => ({ steps });

const makeSuccessDeps = (): ApplyDeps => ({
  applyStep: () => Effect.void,
  updateLockfile: () => Effect.void,
  updateSettings: () => Effect.void,
});

const makeFailingDeps = (failOnSkill: string, errorMessage: string): ApplyDeps => ({
  applyStep: (step) =>
    step.skill === failOnSkill
      ? Effect.fail(
          new ApplyError({
            message: errorMessage,
            step: Option.some(step),
            cause: Option.none(),
          }),
        )
      : Effect.void,
  updateLockfile: () => Effect.void,
  updateSettings: () => Effect.void,
});

// =============================================================================
// Tests
// =============================================================================

describe("emptyApplyResult", () => {
  it("returns result with empty arrays and zero counts", () => {
    const result = emptyApplyResult();

    expect(result.applied).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.summary).toEqual({
      installed: 0,
      updated: 0,
      uninstalled: 0,
      failed: 0,
    });
  });
});

describe("displayPlan", () => {
  it("displays empty message for empty plan", async () => {
    const plan = makePlan([]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await Effect.runPromise(displayPlan(plan));

    expect(consoleSpy).toHaveBeenCalledWith("No changes to apply.");
    consoleSpy.mockRestore();
  });

  it("displays install step with version and agents", async () => {
    const plan = makePlan([makeInstallStep("commit", ["claude", "cursor"])]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await Effect.runPromise(displayPlan(plan));

    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.includes("(install)"))).toBe(true);
    expect(calls.some((c) => c.includes("commit"))).toBe(true);
    expect(calls.some((c) => c.includes("claude, cursor"))).toBe(true);
    consoleSpy.mockRestore();
  });

  it("displays update step with from/to versions", async () => {
    const plan = makePlan([makeUpdateStep("review-pr")]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await Effect.runPromise(displayPlan(plan));

    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.includes("(update)"))).toBe(true);
    expect(calls.some((c) => c.includes("1.0.0"))).toBe(true);
    expect(calls.some((c) => c.includes("2.0.0"))).toBe(true);
    consoleSpy.mockRestore();
  });

  it("displays uninstall step", async () => {
    const plan = makePlan([makeUninstallStep("old-skill")]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await Effect.runPromise(displayPlan(plan));

    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.includes("(uninstall)"))).toBe(true);
    expect(calls.some((c) => c.includes("old-skill"))).toBe(true);
    consoleSpy.mockRestore();
  });

  it("displays summary with skill counts", async () => {
    const plan = makePlan([
      makeInstallStep("skill-1"),
      makeInstallStep("skill-2"),
      makeUpdateStep("skill-3"),
    ]);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await Effect.runPromise(displayPlan(plan));

    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.includes("2 skills to install"))).toBe(true);
    expect(calls.some((c) => c.includes("1 skill to update"))).toBe(true);
    consoleSpy.mockRestore();
  });
});

describe("applyPlan", () => {
  describe("dry-run mode", () => {
    it("displays plan without side effects", async () => {
      const plan = makePlan([makeInstallStep("commit")]);
      const opts: ApplyOptions = { dryRun: true };
      const applyStepSpy = vi.fn().mockReturnValue(Effect.void);
      const updateLockfileSpy = vi.fn().mockReturnValue(Effect.void);
      const updateSettingsSpy = vi.fn().mockReturnValue(Effect.void);
      const deps: ApplyDeps = {
        applyStep: applyStepSpy,
        updateLockfile: updateLockfileSpy,
        updateSettings: updateSettingsSpy,
      };
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const result = await Effect.runPromise(applyPlan(plan, opts, deps));

      expect(result).toEqual(emptyApplyResult());
      expect(applyStepSpy).not.toHaveBeenCalled();
      expect(updateLockfileSpy).not.toHaveBeenCalled();
      expect(updateSettingsSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("returns empty result for empty plan in dry-run", async () => {
      const plan = makePlan([]);
      const opts: ApplyOptions = { dryRun: true };
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const result = await Effect.runPromise(applyPlan(plan, opts, makeSuccessDeps()));

      expect(result).toEqual(emptyApplyResult());
      consoleSpy.mockRestore();
    });
  });

  describe("apply mode", () => {
    it("executes all steps for a valid plan", async () => {
      const plan = makePlan([makeInstallStep("skill-1"), makeInstallStep("skill-2")]);
      const opts: ApplyOptions = { dryRun: false };
      const applyStepSpy = vi.fn().mockReturnValue(Effect.void);
      const deps: ApplyDeps = {
        applyStep: applyStepSpy,
        updateLockfile: () => Effect.void,
        updateSettings: () => Effect.void,
      };

      const result = await Effect.runPromise(applyPlan(plan, opts, deps));

      expect(applyStepSpy).toHaveBeenCalledTimes(2);
      expect(result.applied).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.summary.installed).toBe(2);
    });

    it("updates lockfile and settings on success", async () => {
      const plan = makePlan([makeInstallStep("commit")]);
      const opts: ApplyOptions = { dryRun: false };
      const updateLockfileSpy = vi.fn().mockReturnValue(Effect.void);
      const updateSettingsSpy = vi.fn().mockReturnValue(Effect.void);
      const deps: ApplyDeps = {
        applyStep: () => Effect.void,
        updateLockfile: updateLockfileSpy,
        updateSettings: updateSettingsSpy,
      };

      await Effect.runPromise(applyPlan(plan, opts, deps));

      expect(updateLockfileSpy).toHaveBeenCalledTimes(1);
      expect(updateSettingsSpy).toHaveBeenCalledTimes(1);
    });

    it("does not update lockfile/settings for empty plan", async () => {
      const plan = makePlan([]);
      const opts: ApplyOptions = { dryRun: false };
      const updateLockfileSpy = vi.fn().mockReturnValue(Effect.void);
      const updateSettingsSpy = vi.fn().mockReturnValue(Effect.void);
      const deps: ApplyDeps = {
        applyStep: () => Effect.void,
        updateLockfile: updateLockfileSpy,
        updateSettings: updateSettingsSpy,
      };

      await Effect.runPromise(applyPlan(plan, opts, deps));

      expect(updateLockfileSpy).not.toHaveBeenCalled();
      expect(updateSettingsSpy).not.toHaveBeenCalled();
    });

    it("counts summary correctly for mixed operations", async () => {
      const plan = makePlan([
        makeInstallStep("new-skill"),
        makeUpdateStep("existing-skill"),
        makeUninstallStep("old-skill"),
      ]);
      const opts: ApplyOptions = { dryRun: false };

      const result = await Effect.runPromise(applyPlan(plan, opts, makeSuccessDeps()));

      expect(result.summary).toEqual({
        installed: 1,
        updated: 1,
        uninstalled: 1,
        failed: 0,
      });
    });
  });

  describe("progress callback", () => {
    it("calls onProgress for each step with starting and completed", async () => {
      const plan = makePlan([makeInstallStep("skill-1"), makeInstallStep("skill-2")]);
      const progressEvents: Array<{ skill: string; status: "starting" | "completed" }> = [];
      const opts: ApplyOptions = {
        dryRun: false,
        onProgress: (step, status) => progressEvents.push({ skill: step.skill, status }),
      };

      await Effect.runPromise(applyPlan(plan, opts, makeSuccessDeps()));

      expect(progressEvents).toEqual([
        { skill: "skill-1", status: "starting" },
        { skill: "skill-1", status: "completed" },
        { skill: "skill-2", status: "starting" },
        { skill: "skill-2", status: "completed" },
      ]);
    });

    it("does not call onProgress in dry-run mode", async () => {
      const plan = makePlan([makeInstallStep("skill-1")]);
      const progressEvents: Array<{ skill: string; status: "starting" | "completed" }> = [];
      const opts: ApplyOptions = {
        dryRun: true,
        onProgress: (step, status) => progressEvents.push({ skill: step.skill, status }),
      };
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await Effect.runPromise(applyPlan(plan, opts, makeSuccessDeps()));

      expect(progressEvents).toHaveLength(0);
      consoleSpy.mockRestore();
    });

    it("calls starting but not completed on failure", async () => {
      const plan = makePlan([makeInstallStep("skill-1")]);
      const progressEvents: Array<{ skill: string; status: "starting" | "completed" }> = [];
      const opts: ApplyOptions = {
        dryRun: false,
        onProgress: (step, status) => progressEvents.push({ skill: step.skill, status }),
      };
      const deps = makeFailingDeps("skill-1", "Install failed");

      await Effect.runPromise(applyPlan(plan, opts, deps));

      expect(progressEvents).toEqual([{ skill: "skill-1", status: "starting" }]);
    });
  });

  describe("failure handling", () => {
    it("stops execution on first failure", async () => {
      const plan = makePlan([
        makeInstallStep("skill-1"),
        makeInstallStep("skill-2"),
        makeInstallStep("skill-3"),
      ]);
      const opts: ApplyOptions = { dryRun: false };
      const applyStepCalls: string[] = [];
      const deps: ApplyDeps = {
        applyStep: (step) => {
          applyStepCalls.push(step.skill);
          if (step.skill === "skill-2") {
            return Effect.fail(
              new ApplyError({
                message: "Install failed",
                step: Option.some(step),
                cause: Option.none(),
              }),
            );
          }
          return Effect.void;
        },
        updateLockfile: () => Effect.void,
        updateSettings: () => Effect.void,
      };

      const result = await Effect.runPromise(applyPlan(plan, opts, deps));

      expect(applyStepCalls).toEqual(["skill-1", "skill-2"]);
      expect(result.applied).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      const failedStep = result.failed[0];
      expect(failedStep).toBeDefined();
      expect(failedStep?.step.skill).toBe("skill-2");
    });

    it("does not update lockfile/settings on failure", async () => {
      const plan = makePlan([makeInstallStep("skill-1")]);
      const opts: ApplyOptions = { dryRun: false };
      const updateLockfileSpy = vi.fn().mockReturnValue(Effect.void);
      const updateSettingsSpy = vi.fn().mockReturnValue(Effect.void);
      const deps: ApplyDeps = {
        applyStep: () =>
          Effect.fail(
            new ApplyError({
              message: "Install failed",
              step: Option.none(),
              cause: Option.none(),
            }),
          ),
        updateLockfile: updateLockfileSpy,
        updateSettings: updateSettingsSpy,
      };

      await Effect.runPromise(applyPlan(plan, opts, deps));

      expect(updateLockfileSpy).not.toHaveBeenCalled();
      expect(updateSettingsSpy).not.toHaveBeenCalled();
    });

    it("returns failed steps with error details", async () => {
      const plan = makePlan([makeInstallStep("failing-skill")]);
      const opts: ApplyOptions = { dryRun: false };
      const deps = makeFailingDeps("failing-skill", "Source not found");

      const result = await Effect.runPromise(applyPlan(plan, opts, deps));

      expect(result.failed).toHaveLength(1);
      const failedItem = result.failed[0];
      expect(failedItem).toBeDefined();
      expect(failedItem?.error.message).toBe("Source not found");
      expect(result.summary.failed).toBe(1);
    });
  });
});

describe("PlanStep constructors", () => {
  it("creates InstallSkill with correct tag", () => {
    const step = PlanStepConstructor.InstallSkill({
      skill: "commit",
      source: makeLocalSource("/path/to/source"),
      version: Option.some("1.0.0"),
      gitTreeHash: Option.some("abc123"),
      agents: ["claude"],
    });

    expect(step._tag).toBe("InstallSkill");
    expect(step.skill).toBe("commit");
  });

  it("creates UpdateSkill with correct tag", () => {
    const step = PlanStepConstructor.UpdateSkill({
      skill: "review-pr",
      source: makeLocalSource("/path/to/source"),
      fromVersion: Option.some("1.0.0"),
      toVersion: Option.some("2.0.0"),
      fromHash: Option.none(),
      toHash: Option.none(),
      agents: ["claude", "cursor"],
    });

    expect(step._tag).toBe("UpdateSkill");
    expect(step.skill).toBe("review-pr");
  });

  it("creates UninstallSkill with correct tag", () => {
    const step = PlanStepConstructor.UninstallSkill({
      skill: "old-skill",
      agents: ["claude"],
    });

    expect(step._tag).toBe("UninstallSkill");
    expect(step.skill).toBe("old-skill");
  });
});

// =============================================================================
// applyStep Tests
// =============================================================================

const runWithFs = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeContext.layer)));

describe("applyStep - InstallSkill", () => {
  let tempDir: string;
  let workspacePath: string;
  let sourceDir: string;

  beforeEach(async () => {
    tempDir = await runWithFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tmpBase = os.tmpdir();
        const dir = nodePath.join(
          tmpBase,
          `axm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        );
        yield* fs.makeDirectory(dir, { recursive: true });
        return dir;
      }),
    );
    workspacePath = nodePath.join(tempDir, ".axm");
    sourceDir = nodePath.join(tempDir, "source");

    await runWithFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(workspacePath, { recursive: true });
      }),
    );
  });

  afterEach(async () => {
    await runWithFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove(tempDir, { recursive: true });
      }),
    );
  });

  it("installs skill from local source to canonical location", async () => {
    const skillSourcePath = nodePath.join(sourceDir, "my-skill");
    await runWithFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillSourcePath, { recursive: true });
        yield* fs.writeFileString(nodePath.join(skillSourcePath, "SKILL.md"), "# My Skill");
        yield* fs.writeFileString(nodePath.join(skillSourcePath, "helper.ts"), "// helper");
      }),
    );

    const step: PlanStep = PlanStepConstructor.InstallSkill({
      skill: "my-skill",
      source: makeLocalSource(skillSourcePath),
      version: Option.none(),
      gitTreeHash: Option.some("abc123"),
      agents: [],
    });

    await runWithFs(applyStep(step, { workspacePath, agents: [] }));

    const skillPath = nodePath.join(workspacePath, "extensions", "external", "skills", "my-skill");
    const [skillMdExists, helperExists] = await runWithFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const md = yield* fs.exists(nodePath.join(skillPath, "SKILL.md"));
        const helper = yield* fs.exists(nodePath.join(skillPath, "helper.ts"));
        return [md, helper] as const;
      }),
    );
    expect(skillMdExists).toBe(true);
    expect(helperExists).toBe(true);
  });

  it("syncs skill to agent directories via symlink", async () => {
    const skillSourcePath = nodePath.join(sourceDir, "my-skill");
    const claudeDir = nodePath.join(tempDir, ".claude");

    await runWithFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillSourcePath, { recursive: true });
        yield* fs.writeFileString(nodePath.join(skillSourcePath, "SKILL.md"), "# My Skill");
        yield* fs.makeDirectory(claudeDir, { recursive: true });
      }),
    );

    const step: PlanStep = PlanStepConstructor.InstallSkill({
      skill: "my-skill",
      source: makeLocalSource(skillSourcePath),
      version: Option.none(),
      gitTreeHash: Option.none(),
      agents: ["claude-code"],
    });

    await runWithFs(
      applyStep(step, {
        workspacePath,
        agents: [
          {
            id: "claude-code" as const,
            name: "Claude Code",
            skills: {
              dir: nodePath.join(claudeDir, "commands"),
            },
          },
        ],
      }),
    );

    const agentSkillPath = nodePath.join(claudeDir, "commands", "my-skill", "SKILL.md");
    const exists = await runWithFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        return yield* fs.exists(agentSkillPath);
      }),
    );
    expect(exists).toBe(true);
  });

  it("fails with ApplyError when source does not exist", async () => {
    const step: PlanStep = PlanStepConstructor.InstallSkill({
      skill: "missing-skill",
      source: makeLocalSource("/nonexistent/path"),
      version: Option.none(),
      gitTreeHash: Option.none(),
      agents: [],
    });

    const result = await runWithFs(
      applyStep(step, { workspacePath, agents: [] }).pipe(
        Effect.map(() => ({ success: true as const })),
        Effect.catchTag("ApplyError", (e) => Effect.succeed({ success: false as const, error: e })),
      ),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("Source directory does not exist");
    }
  });
});

describe("applyStep - UpdateSkill", () => {
  let tempDir: string;
  let workspacePath: string;
  let sourceDir: string;

  beforeEach(async () => {
    tempDir = await runWithFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tmpBase = os.tmpdir();
        const dir = nodePath.join(
          tmpBase,
          `axm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        );
        yield* fs.makeDirectory(dir, { recursive: true });
        return dir;
      }),
    );
    workspacePath = nodePath.join(tempDir, ".axm");
    sourceDir = nodePath.join(tempDir, "source");

    await runWithFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(workspacePath, { recursive: true });
      }),
    );
  });

  afterEach(async () => {
    await runWithFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove(tempDir, { recursive: true });
      }),
    );
  });

  it("replaces existing skill with new version", async () => {
    const oldSkillPath = nodePath.join(
      workspacePath,
      "extensions",
      "external",
      "skills",
      "my-skill",
    );
    const newSourcePath = nodePath.join(sourceDir, "my-skill");

    await runWithFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(oldSkillPath, { recursive: true });
        yield* fs.writeFileString(nodePath.join(oldSkillPath, "SKILL.md"), "# Old Version");
        yield* fs.writeFileString(nodePath.join(oldSkillPath, "old-file.ts"), "// old");
        yield* fs.makeDirectory(newSourcePath, { recursive: true });
        yield* fs.writeFileString(nodePath.join(newSourcePath, "SKILL.md"), "# New Version");
        yield* fs.writeFileString(nodePath.join(newSourcePath, "new-file.ts"), "// new");
      }),
    );

    const step: PlanStep = PlanStepConstructor.UpdateSkill({
      skill: "my-skill",
      source: makeLocalSource(newSourcePath),
      fromVersion: Option.some("1.0.0"),
      toVersion: Option.some("2.0.0"),
      fromHash: Option.some("old-hash"),
      toHash: Option.some("new-hash"),
      agents: [],
    });

    await runWithFs(applyStep(step, { workspacePath, agents: [] }));

    const [hasNewFile, hasOldFile, content] = await runWithFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const newExists = yield* fs.exists(nodePath.join(oldSkillPath, "new-file.ts"));
        const oldExists = yield* fs.exists(nodePath.join(oldSkillPath, "old-file.ts"));
        const skillContent = yield* fs.readFileString(nodePath.join(oldSkillPath, "SKILL.md"));
        return [newExists, oldExists, skillContent] as const;
      }),
    );

    expect(hasNewFile).toBe(true);
    expect(hasOldFile).toBe(false);
    expect(content).toBe("# New Version");
  });
});

describe("applyStep - UninstallSkill", () => {
  let tempDir: string;
  let workspacePath: string;

  beforeEach(async () => {
    tempDir = await runWithFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tmpBase = os.tmpdir();
        const dir = nodePath.join(
          tmpBase,
          `axm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        );
        yield* fs.makeDirectory(dir, { recursive: true });
        return dir;
      }),
    );
    workspacePath = nodePath.join(tempDir, ".axm");

    await runWithFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(workspacePath, { recursive: true });
      }),
    );
  });

  afterEach(async () => {
    await runWithFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove(tempDir, { recursive: true });
      }),
    );
  });

  it("removes skill from canonical location", async () => {
    const skillPath = nodePath.join(workspacePath, "extensions", "external", "skills", "my-skill");
    await runWithFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillPath, { recursive: true });
        yield* fs.writeFileString(nodePath.join(skillPath, "SKILL.md"), "# My Skill");
      }),
    );

    const step: PlanStep = PlanStepConstructor.UninstallSkill({
      skill: "my-skill",
      agents: [],
    });

    await runWithFs(applyStep(step, { workspacePath, agents: [] }));

    const exists = await runWithFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        return yield* fs.exists(skillPath);
      }),
    );
    expect(exists).toBe(false);
  });

  it("removes skill symlinks from agent directories", async () => {
    const claudeDir = nodePath.join(tempDir, ".claude");
    const skillPath = nodePath.join(workspacePath, "extensions", "external", "skills", "my-skill");
    const agentSkillPath = nodePath.join(claudeDir, "commands", "my-skill");

    await runWithFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillPath, { recursive: true });
        yield* fs.writeFileString(nodePath.join(skillPath, "SKILL.md"), "# My Skill");
        yield* fs.makeDirectory(nodePath.join(claudeDir, "commands"), { recursive: true });
        const relPath = nodePath.relative(nodePath.join(claudeDir, "commands"), skillPath);
        yield* fs.symlink(relPath, agentSkillPath);
      }),
    );

    const step: PlanStep = PlanStepConstructor.UninstallSkill({
      skill: "my-skill",
      agents: ["claude-code"],
    });

    await runWithFs(
      applyStep(step, {
        workspacePath,
        agents: [
          {
            id: "claude-code" as const,
            name: "Claude Code",
            skills: {
              dir: nodePath.join(claudeDir, "commands"),
            },
          },
        ],
      }),
    );

    const [canonicalExists, agentExists] = await runWithFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const cExists = yield* fs.exists(skillPath);
        const aExists = yield* fs.exists(agentSkillPath);
        return [cExists, aExists] as const;
      }),
    );
    expect(canonicalExists).toBe(false);
    expect(agentExists).toBe(false);
  });

  it("succeeds even if skill does not exist", async () => {
    const step: PlanStep = PlanStepConstructor.UninstallSkill({
      skill: "nonexistent-skill",
      agents: [],
    });

    // Should not throw
    await runWithFs(applyStep(step, { workspacePath, agents: [] }));
  });
});

// =============================================================================
// updateLockfileForPlan Tests
// =============================================================================

describe("updateLockfileForPlan", () => {
  let tempDir: string;
  let axmDir: string;

  beforeEach(async () => {
    tempDir = await runWithFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tmpBase = os.tmpdir();
        const dir = nodePath.join(
          tmpBase,
          `axm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        );
        yield* fs.makeDirectory(dir, { recursive: true });
        return dir;
      }),
    );
    axmDir = nodePath.join(tempDir, ".axm");

    await runWithFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(axmDir, { recursive: true });
      }),
    );
  });

  afterEach(async () => {
    await runWithFs(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.remove(tempDir, { recursive: true });
      }),
    );
  });

  it("adds new skill entries for InstallSkill steps", async () => {
    const plan = makePlan([
      PlanStepConstructor.InstallSkill({
        skill: "my-skill",
        source: { _tag: "Local", path: "/path/to/skill" },
        version: Option.some("1.0.0"),
        gitTreeHash: Option.some("abc123"),
        agents: ["claude-code"],
      }),
    ]);

    const { updateLockfileForPlan } = await import("./apply.js");
    await runWithFs(updateLockfileForPlan(axmDir, plan));

    // Verify lockfile was created with the skill
    const { readLockfile } = await import("../lockfile/index.js");
    const lockfile = await runWithFs(readLockfile(axmDir));

    const entry = lockfile.skills["my-skill"];
    expect(entry).toBeDefined();
    expect(entry?.source).toBe("local");
    // Type narrowing for local source entry
    if (entry?.source === "local") {
      expect(entry.path).toBe("/path/to/skill");
    }
    expect(entry?.gitTreeHash).toBe("abc123");
    expect(entry?.agents).toEqual(["claude-code"]);
  });

  it("creates lockfile if it does not exist", async () => {
    const plan = makePlan([
      PlanStepConstructor.InstallSkill({
        skill: "first-skill",
        source: { _tag: "Local", path: "/path/to/skill" },
        version: Option.none(),
        gitTreeHash: Option.none(),
        agents: [],
      }),
    ]);

    const { updateLockfileForPlan } = await import("./apply.js");
    await runWithFs(updateLockfileForPlan(axmDir, plan));

    const { readLockfile } = await import("../lockfile/index.js");
    const lockfile = await runWithFs(readLockfile(axmDir));

    expect(lockfile.lockfileVersion).toBe(1);
    expect(lockfile.skills["first-skill"]).toBeDefined();
  });
});
