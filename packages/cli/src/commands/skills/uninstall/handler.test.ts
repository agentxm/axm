/**
 * Unit tests for the uninstall command handler.
 *
 * Tests the reconciliation pattern for skill uninstallation:
 * 1. Load current state (actual + locked)
 * 2. Build ideal state with skill removed
 * 3. Compute diff (plan)
 * 4. Apply plan
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Settings, SkillLockEntry } from "@agentxm/core/experimental/skills";
import type { FileSystem, Path } from "@effect/platform";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach, vi } from "vitest";
import YAML from "yaml";
import { handleUninstall, type UninstallArgs, UninstallError } from "./handler.js";

// Layer providing all required services for tests
const TestLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

// Mock TTY utilities
vi.mock("../../../utils/tty.js", () => ({
  isInteractive: vi.fn(() => true),
}));

describe("uninstall.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "uninstall-handler-test-"));
    // Change to temp dir so .axm is created there
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper function to provide the test layer to an effect.
   */
  const withTestLayer = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
    effect.pipe(Effect.provide(TestLayer));

  const defaultArgs: UninstallArgs = {
    skill: "",
    agent: [],
    yes: false,
    dryRun: false,
  };

  /**
   * Initializes .axm directory with settings.
   */
  const initializeAxm = (agents: string[] = []): void => {
    const axmDir = path.join(tempDir, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });

    // Cast is safe: test helper only uses valid agent IDs from SUPPORTED_AGENTS
    const settings: Settings = {
      agents: agents as Settings["agents"],
      skills: {},
    };

    fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings, null, 2));
  };

  /**
   * Installs a skill directly by creating files (bypasses install handler).
   * Uses V2 directory structure: .axm/extensions/external/skills/<skillName>/
   */
  const installSkillDirectly = (
    skillName: string,
    agents: string[] = ["claude-code"],
    content = "# Test Skill",
  ): void => {
    const axmDir = path.join(tempDir, ".axm");

    // Create canonical skill directory using V2 structure
    const skillDir = path.join(axmDir, "extensions", "external", "skills", skillName);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), content);

    // Update settings
    const settingsPath = path.join(axmDir, "settings.json");
    const existingSettings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Settings;
    const updatedSettings = {
      ...existingSettings,
      skills: { ...existingSettings.skills, [skillName]: "*" },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(updatedSettings, null, 2));

    // Create lockfile entry
    const lockfilePath = path.join(axmDir, "axm-lock.yaml");
    let lockfile: { lockfileVersion: number; skills: Record<string, SkillLockEntry> };

    if (fs.existsSync(lockfilePath)) {
      lockfile = YAML.parse(fs.readFileSync(lockfilePath, "utf-8"));
    } else {
      lockfile = { lockfileVersion: 1, skills: {} };
    }

    const now = new Date();
    lockfile.skills[skillName] = {
      source: "local",
      path: skillDir,
      gitTreeHash: "sha256:test",
      agents,
      installedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    } as unknown as SkillLockEntry;

    fs.writeFileSync(lockfilePath, YAML.stringify(lockfile));
  };

  // =============================================================================
  // Basic Uninstall Flow Tests
  // =============================================================================

  describe("basic uninstall flow", () => {
    it.effect("uninstalls a skill and removes from settings and lockfile", () =>
      withTestLayer(
        Effect.gen(function* () {
          initializeAxm(["claude-code"]);
          installSkillDirectly("my-skill", ["claude-code"]);

          const args: UninstallArgs = {
            ...defaultArgs,
            skill: "my-skill",
            yes: true,
          };

          yield* handleUninstall(args);

          // Canonical skill directory should be removed
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "my-skill"),
            ),
          ).toBe(false);

          // Settings should not have the skill
          const settings: Settings = JSON.parse(
            fs.readFileSync(path.join(tempDir, ".axm", "settings.json"), "utf-8"),
          );
          expect(settings.skills?.["my-skill"]).toBeUndefined();

          // Lockfile should not have the skill
          const lockfile = YAML.parse(
            fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8"),
          );
          expect(lockfile.skills["my-skill"]).toBeUndefined();
        }),
      ),
    );
  });

  // =============================================================================
  // Skill Not Found Tests
  // =============================================================================

  describe("skill not found", () => {
    it.effect("fails with error when skill is not installed", () =>
      withTestLayer(
        Effect.gen(function* () {
          initializeAxm(["claude-code"]);

          const args: UninstallArgs = {
            ...defaultArgs,
            skill: "unknown-skill",
            yes: true,
          };

          const error = yield* handleUninstall(args).pipe(Effect.flip);

          expect(error._tag).toBe("UninstallError");
          expect((error as UninstallError).message).toContain("unknown-skill");
          expect((error as UninstallError).message).toContain("not installed");
        }),
      ),
    );
  });

  // =============================================================================
  // Dry Run Mode Tests
  // =============================================================================

  describe("dry-run mode", () => {
    it.effect("displays plan without making changes in dry-run mode", () =>
      withTestLayer(
        Effect.gen(function* () {
          initializeAxm(["claude-code"]);
          installSkillDirectly("my-skill", ["claude-code"]);

          const args: UninstallArgs = {
            ...defaultArgs,
            skill: "my-skill",
            dryRun: true,
          };

          yield* handleUninstall(args);

          // Skill should NOT be removed in dry-run mode
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "my-skill"),
            ),
          ).toBe(true);

          // Settings should still have the skill
          const settings: Settings = JSON.parse(
            fs.readFileSync(path.join(tempDir, ".axm", "settings.json"), "utf-8"),
          );
          expect(settings.skills?.["my-skill"]).toBe("*");

          // Lockfile should still have the skill
          const lockfile = YAML.parse(
            fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8"),
          );
          expect(lockfile.skills["my-skill"]).toBeDefined();
        }),
      ),
    );
  });

  // =============================================================================
  // --yes Flag Tests
  // =============================================================================

  describe("--yes flag", () => {
    it.effect("skips confirmation prompt with --yes", () =>
      withTestLayer(
        Effect.gen(function* () {
          initializeAxm(["claude-code"]);
          installSkillDirectly("my-skill", ["claude-code"]);

          const args: UninstallArgs = {
            ...defaultArgs,
            skill: "my-skill",
            yes: true,
          };

          // Should complete without prompting
          yield* handleUninstall(args);

          // Skill should be removed
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "my-skill"),
            ),
          ).toBe(false);
        }),
      ),
    );
  });

  // =============================================================================
  // --agent Flag Tests (Partial Uninstall)
  // =============================================================================

  describe("--agent flag (partial uninstall)", () => {
    it.effect("removes skill from specified agent only", () =>
      withTestLayer(
        Effect.gen(function* () {
          initializeAxm(["claude-code", "cursor"]);
          installSkillDirectly("my-skill", ["claude-code", "cursor"]);

          const args: UninstallArgs = {
            ...defaultArgs,
            skill: "my-skill",
            agent: ["claude-code"],
            yes: true,
          };

          yield* handleUninstall(args);

          // Lockfile should still have the skill but only for cursor
          const lockfile = YAML.parse(
            fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8"),
          );
          expect(lockfile.skills["my-skill"]).toBeDefined();
          expect(lockfile.skills["my-skill"].agents).toEqual(["cursor"]);

          // Canonical copy should still exist (other agents still have it)
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "my-skill"),
            ),
          ).toBe(true);
        }),
      ),
    );

    it.effect("removes canonical when uninstalling from last agent", () =>
      withTestLayer(
        Effect.gen(function* () {
          initializeAxm(["claude-code"]);
          installSkillDirectly("my-skill", ["claude-code"]);

          const args: UninstallArgs = {
            ...defaultArgs,
            skill: "my-skill",
            agent: ["claude-code"],
            yes: true,
          };

          yield* handleUninstall(args);

          // Canonical should be removed (last agent)
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "my-skill"),
            ),
          ).toBe(false);

          // Lockfile entry should be removed
          const lockfile = YAML.parse(
            fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8"),
          );
          expect(lockfile.skills["my-skill"]).toBeUndefined();
        }),
      ),
    );

    it.effect("removes skill from multiple specified agents", () =>
      withTestLayer(
        Effect.gen(function* () {
          initializeAxm(["claude-code", "cursor", "windsurf"]);
          installSkillDirectly("my-skill", ["claude-code", "cursor", "windsurf"]);

          const args: UninstallArgs = {
            ...defaultArgs,
            skill: "my-skill",
            agent: ["claude-code", "cursor"],
            yes: true,
          };

          yield* handleUninstall(args);

          // Lockfile should still have the skill but only for windsurf
          const lockfile = YAML.parse(
            fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8"),
          );
          expect(lockfile.skills["my-skill"]).toBeDefined();
          expect(lockfile.skills["my-skill"].agents).toEqual(["windsurf"]);
        }),
      ),
    );
  });

  // =============================================================================
  // Error Handling Tests
  // =============================================================================

  describe("error handling", () => {
    it.effect("returns UninstallError when workspace not initialized", () =>
      withTestLayer(
        Effect.gen(function* () {
          // Don't initialize axm
          const args: UninstallArgs = {
            ...defaultArgs,
            skill: "my-skill",
            yes: true,
          };

          const error = yield* handleUninstall(args).pipe(Effect.flip);

          expect(error._tag).toBe("UninstallError");
        }),
      ),
    );
  });

  // =============================================================================
  // Non-TTY Scenarios Tests
  // =============================================================================

  describe("non-TTY scenarios", () => {
    let isInteractiveMock: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      const ttyModule = await import("../../../utils/tty.js");
      isInteractiveMock = ttyModule.isInteractive as ReturnType<typeof vi.fn>;
      isInteractiveMock.mockReturnValue(true);
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it.effect("fails when stdin is not TTY and no --yes flag", () =>
      withTestLayer(
        Effect.gen(function* () {
          isInteractiveMock.mockReturnValue(false);
          initializeAxm(["claude-code"]);
          installSkillDirectly("my-skill", ["claude-code"]);

          const args: UninstallArgs = {
            ...defaultArgs,
            skill: "my-skill",
            // No --yes flag
          };

          const error = yield* handleUninstall(args).pipe(Effect.flip);

          expect(error._tag).toBe("UninstallError");
          expect((error as UninstallError).message).toContain("Cannot prompt");
        }),
      ),
    );

    it.effect("succeeds when stdin is not TTY but --yes flag is set", () =>
      withTestLayer(
        Effect.gen(function* () {
          isInteractiveMock.mockReturnValue(false);
          initializeAxm(["claude-code"]);
          installSkillDirectly("my-skill", ["claude-code"]);

          const args: UninstallArgs = {
            ...defaultArgs,
            skill: "my-skill",
            yes: true,
          };

          yield* handleUninstall(args);

          // Skill should be removed
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "my-skill"),
            ),
          ).toBe(false);
        }),
      ),
    );

    it.effect("succeeds when stdin is not TTY but --dry-run flag is set", () =>
      withTestLayer(
        Effect.gen(function* () {
          isInteractiveMock.mockReturnValue(false);
          initializeAxm(["claude-code"]);
          installSkillDirectly("my-skill", ["claude-code"]);

          const args: UninstallArgs = {
            ...defaultArgs,
            skill: "my-skill",
            dryRun: true,
          };

          yield* handleUninstall(args);

          // Skill should still exist (dry-run)
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "my-skill"),
            ),
          ).toBe(true);
        }),
      ),
    );
  });

  // =============================================================================
  // State-based Reconciliation Tests
  // =============================================================================

  describe("state-based reconciliation pattern", () => {
    it.effect("uses loadSkillsState, buildIdealForUninstall, computeDiff, and applyDiff", () =>
      withTestLayer(
        Effect.gen(function* () {
          initializeAxm(["claude-code"]);
          installSkillDirectly("state-test-skill", ["claude-code"]);

          const args: UninstallArgs = {
            ...defaultArgs,
            skill: "state-test-skill",
            yes: true,
          };

          // Execute uninstall - should use state-based pattern internally
          yield* handleUninstall(args);

          // Verify the outcome is correct (state-based pattern produces same result)
          // Canonical skill directory should be removed
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "state-test-skill"),
            ),
          ).toBe(false);

          // Settings should not have the skill
          const settings: Settings = JSON.parse(
            fs.readFileSync(path.join(tempDir, ".axm", "settings.json"), "utf-8"),
          );
          expect(settings.skills?.["state-test-skill"]).toBeUndefined();

          // Lockfile should not have the skill
          const lockfile = YAML.parse(
            fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8"),
          );
          expect(lockfile.skills["state-test-skill"]).toBeUndefined();
        }),
      ),
    );

    it.effect("handles partial uninstall via state-based pattern", () =>
      withTestLayer(
        Effect.gen(function* () {
          initializeAxm(["claude-code", "cursor"]);
          installSkillDirectly("partial-state-skill", ["claude-code", "cursor"]);

          const args: UninstallArgs = {
            ...defaultArgs,
            skill: "partial-state-skill",
            agent: ["claude-code"],
            yes: true,
          };

          yield* handleUninstall(args);

          // Canonical should still exist (other agents still use it)
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "partial-state-skill"),
            ),
          ).toBe(true);

          // Lockfile should have reduced agents
          const lockfile = YAML.parse(
            fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8"),
          );
          expect(lockfile.skills["partial-state-skill"]).toBeDefined();
          expect(lockfile.skills["partial-state-skill"].agents).toEqual(["cursor"]);
        }),
      ),
    );
  });

  // =============================================================================
  // UninstallError Tests
  // =============================================================================

  describe("UninstallError", () => {
    it("is a tagged error with correct tag", () => {
      const error = new UninstallError({
        message: "Test error message",
        retryable: false,
      });

      expect(error._tag).toBe("UninstallError");
      expect(error.message).toBe("Test error message");
    });

    it("can include a cause", () => {
      const cause = new Error("Original error");
      const error = new UninstallError({
        message: "Wrapped error",
        cause,
        retryable: false,
      });

      expect(error.cause).toBe(cause);
    });
  });
});
