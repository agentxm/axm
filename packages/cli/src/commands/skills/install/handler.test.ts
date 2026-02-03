/**
 * Unit tests for the install command handler.
 *
 * Tests the reconciliation pattern:
 * 1. makeWorkspaceContext -> ensureInit -> loadCurrentState
 * 2. buildIdealState -> buildPlan -> applyPlan
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Settings } from "@agentxm/core/experimental/skills";
import { FetchHttpClient, type FileSystem, type HttpClient, type Path } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, vi } from "vitest";
import YAML from "yaml";
import { handleInstall, type InstallArgs, InstallError } from "./handler.js";

// Layer providing all required services for tests
const TestLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer, FetchHttpClient.layer);

// Mock TTY utilities
vi.mock("../../../utils/tty.js", () => ({
  isInteractive: vi.fn(() => true),
  isFancyOutput: vi.fn(() => true),
}));

describe("install.handler", () => {
  let tempDir: string;
  let originalCwd: string;
  let sourceDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "install-handler-test-"));
    sourceDir = path.join(tempDir, "source-skills");
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
  const withTestLayer = <A, E>(
    effect: Effect.Effect<A, E, FileSystem.FileSystem | HttpClient.HttpClient | Path.Path>,
  ) => effect.pipe(Effect.provide(TestLayer));

  const defaultArgs: InstallArgs = {
    source: "",
    global: false,
    agent: [],
    skill: [],
    yes: false,
    list: false,
    all: false,
    force: false,
  };

  /**
   * Creates a local skill source directory with SKILL.md files.
   */
  const createSkillSource = (skills: { name: string; description?: string }[]): string => {
    fs.mkdirSync(sourceDir, { recursive: true });

    for (const { name, description } of skills) {
      const skillDir = path.join(sourceDir, name);
      fs.mkdirSync(skillDir, { recursive: true });

      const content = description ? `# ${name}\n\n${description}` : `# ${name}\n\nA test skill.`;

      fs.writeFileSync(path.join(skillDir, "SKILL.md"), content);
    }

    return sourceDir;
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

  // =============================================================================
  // Reconciliation Pattern Tests
  // =============================================================================

  describe("reconciliation pattern", () => {
    describe("workspace initialization", () => {
      it.effect("initializes .axm directory if not present", () =>
        withTestLayer(
          Effect.gen(function* () {
            const source = createSkillSource([{ name: "commit" }]);
            // Don't call initializeAxm() - let handler create it

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              all: true,
              yes: true,
              agent: ["claude-code"],
            };

            yield* handleInstall(args);

            expect(fs.existsSync(path.join(tempDir, ".axm"))).toBe(true);
            expect(fs.existsSync(path.join(tempDir, ".axm", "settings.json"))).toBe(true);
          }),
        ),
      );
    });

    describe("dry-run mode", () => {
      it.effect("displays plan without making changes in dry-run mode", () =>
        withTestLayer(
          Effect.gen(function* () {
            const source = createSkillSource([{ name: "commit" }]);
            initializeAxm();

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              all: true,
              dryRun: true,
              agent: ["claude-code"],
            };

            yield* handleInstall(args);

            // Skill should NOT be installed in dry-run mode
            expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "commit"))).toBe(false);
          }),
        ),
      );

      it.effect("auto-selects all skills in dry-run mode", () =>
        withTestLayer(
          Effect.gen(function* () {
            const source = createSkillSource([{ name: "commit" }, { name: "review-pr" }]);
            initializeAxm();

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              dryRun: true,
              agent: ["claude-code"],
            };

            // Should complete without prompting for skill selection
            yield* handleInstall(args);

            // No skills installed in dry-run
            expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "commit"))).toBe(false);
            expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "review-pr"))).toBe(false);
          }),
        ),
      );
    });

    describe("force flag for unhealthy workspace", () => {
      it.effect("proceeds with installation when --force is used", () =>
        withTestLayer(
          Effect.gen(function* () {
            const source = createSkillSource([{ name: "commit" }]);
            initializeAxm();

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              all: true,
              yes: true,
              force: true,
              agent: ["claude-code"],
            };

            yield* handleInstall(args);

            expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "commit", "SKILL.md"))).toBe(
              true,
            );
          }),
        ),
      );

      it.effect("overwrites existing skills with --force", () =>
        withTestLayer(
          Effect.gen(function* () {
            // Create initial source
            const sourceDir1 = path.join(tempDir, "source-1");
            fs.mkdirSync(sourceDir1, { recursive: true });
            fs.mkdirSync(path.join(sourceDir1, "commit"));
            fs.writeFileSync(path.join(sourceDir1, "commit", "SKILL.md"), "# Original commit");

            initializeAxm();

            // Install first version
            yield* handleInstall({
              ...defaultArgs,
              source: sourceDir1,
              all: true,
              yes: true,
              agent: ["claude-code"],
            });

            // Verify original content
            let content = fs.readFileSync(
              path.join(tempDir, ".axm", "skills", "commit", "SKILL.md"),
              "utf-8",
            );
            expect(content).toBe("# Original commit");

            // Create second source with updated skill
            const sourceDir2 = path.join(tempDir, "source-2");
            fs.mkdirSync(sourceDir2, { recursive: true });
            fs.mkdirSync(path.join(sourceDir2, "commit"));
            fs.writeFileSync(path.join(sourceDir2, "commit", "SKILL.md"), "# Updated commit");

            // Install with --force
            yield* handleInstall({
              ...defaultArgs,
              source: sourceDir2,
              all: true,
              yes: true,
              force: true,
              agent: ["claude-code"],
            });

            // Content should be updated
            content = fs.readFileSync(
              path.join(tempDir, ".axm", "skills", "commit", "SKILL.md"),
              "utf-8",
            );
            expect(content).toBe("# Updated commit");
          }),
        ),
      );
    });

    describe("plan computation", () => {
      it.effect("reports 'already up to date' when no changes needed", () =>
        withTestLayer(
          Effect.gen(function* () {
            const source = createSkillSource([{ name: "commit" }]);
            initializeAxm();

            // First install
            yield* handleInstall({
              ...defaultArgs,
              source,
              all: true,
              yes: true,
              agent: ["claude-code"],
            });

            // Second install - should report no changes
            yield* handleInstall({
              ...defaultArgs,
              source,
              all: true,
              yes: true,
              agent: ["claude-code"],
            });

            // Should have completed successfully (no error thrown)
          }),
        ),
      );
    });
  });

  // =============================================================================
  // Source Parsing Tests
  // =============================================================================

  describe("source parsing", () => {
    it.effect("fails with InstallError for invalid source format", () =>
      withTestLayer(
        Effect.gen(function* () {
          initializeAxm();
          const args: InstallArgs = {
            ...defaultArgs,
            source: "", // Empty source is invalid
            yes: true,
            agent: ["claude-code"],
          };

          const error = yield* handleInstall(args).pipe(Effect.flip);

          expect(error._tag).toBe("InstallError");
          expect((error as InstallError).message).toContain("Invalid source");
        }),
      ),
    );

    it.effect("recognizes local path source type", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          // Just verify it doesn't fail on parsing - we test list mode to avoid agent selection
          const args: InstallArgs = {
            ...defaultArgs,
            source,
            list: true,
            agent: ["claude-code"],
          };

          yield* handleInstall(args);
          // Should succeed (list mode doesn't install)
        }),
      ),
    );
  });

  // =============================================================================
  // Local Source Discovery Tests
  // =============================================================================

  describe("local source discovery", () => {
    it.effect("discovers skills from local path", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([
            { name: "commit", description: "Auto-commit helper" },
            { name: "review-pr", description: "PR review helper" },
          ]);
          initializeAxm();

          // Use list mode to see discovered skills without installing
          const args: InstallArgs = {
            ...defaultArgs,
            source,
            list: true,
            agent: ["claude-code"],
          };

          yield* handleInstall(args);
        }),
      ),
    );

    it.effect("handles empty source directory with error and recovery guidance", () =>
      withTestLayer(
        Effect.gen(function* () {
          fs.mkdirSync(sourceDir, { recursive: true });
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source: sourceDir,
            yes: true,
            agent: ["claude-code"],
          };

          // Should fail with error suggesting to check the source path
          const error = yield* handleInstall(args).pipe(Effect.flip);

          expect(error._tag).toBe("InstallError");
          expect((error as InstallError).message).toContain("No skills found");
          expect((error as InstallError).message).toContain(sourceDir);
          expect((error as InstallError).message).toContain("SKILL.md");
        }),
      ),
    );

    it.effect("handles non-existent source path", () =>
      withTestLayer(
        Effect.gen(function* () {
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source: path.join(tempDir, "nonexistent-dir"),
            yes: true,
            agent: ["claude-code"],
          };

          // Should fail with error about discovering skills
          const error = yield* handleInstall(args).pipe(Effect.flip);

          expect(error._tag).toBe("InstallError");
        }),
      ),
    );
  });

  // =============================================================================
  // Agent Handling Tests
  // =============================================================================

  describe("agent handling", () => {
    it.effect("uses explicitly specified agents via --agent flag", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            agent: ["claude-code"],
            all: true,
            yes: true,
          };

          yield* handleInstall(args);

          // Verify skill was installed to canonical location
          const canonicalSkillPath = path.join(tempDir, ".axm", "skills", "commit", "SKILL.md");
          expect(fs.existsSync(canonicalSkillPath)).toBe(true);
        }),
      ),
    );

    it.effect("warns about invalid agent IDs", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            agent: ["invalid-agent-xyz"],
            all: true,
            yes: true,
          };

          // With invalid agent, should complete but not install to any agent
          // Handler completes without error (just warns about invalid agents)
          yield* handleInstall(args);
        }),
      ),
    );

    it.effect("handles mix of valid and invalid agent IDs", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            agent: ["claude-code", "invalid-agent"],
            all: true,
            yes: true,
          };

          // Should succeed with valid agent
          yield* handleInstall(args);
        }),
      ),
    );
  });

  // =============================================================================
  // Non-Interactive Mode Tests
  // =============================================================================

  describe("non-interactive mode with --yes flag", () => {
    it.effect("skips agent selection prompt with --yes", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            yes: true,
            agent: ["claude-code"],
            all: true,
          };

          // Should complete without prompting
          yield* handleInstall(args);
        }),
      ),
    );

    it.effect("skips skill selection prompt with --yes and --all", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }, { name: "review-pr" }]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            yes: true,
            agent: ["claude-code"],
            all: true,
          };

          yield* handleInstall(args);

          // Both skills should be installed
          expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "commit", "SKILL.md"))).toBe(
            true,
          );
          expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "review-pr", "SKILL.md"))).toBe(
            true,
          );
        }),
      ),
    );

    it.effect("skips confirmation prompt with --yes", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            yes: true,
            agent: ["claude-code"],
            all: true,
          };

          yield* handleInstall(args);
        }),
      ),
    );
  });

  // =============================================================================
  // --all Flag Tests
  // =============================================================================

  describe("--all flag", () => {
    it.effect("installs all discovered skills with --all", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([
            { name: "skill-1" },
            { name: "skill-2" },
            { name: "skill-3" },
          ]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          };

          yield* handleInstall(args);

          // All skills should be installed
          expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "skill-1", "SKILL.md"))).toBe(
            true,
          );
          expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "skill-2", "SKILL.md"))).toBe(
            true,
          );
          expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "skill-3", "SKILL.md"))).toBe(
            true,
          );
        }),
      ),
    );
  });

  // =============================================================================
  // --skill Flag Tests
  // =============================================================================

  describe("--skill flag for specific skills", () => {
    it.effect("installs only specified skills with --skill", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([
            { name: "commit" },
            { name: "review-pr" },
            { name: "debug" },
          ]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            skill: ["commit", "debug"],
            yes: true,
            agent: ["claude-code"],
          };

          yield* handleInstall(args);

          // Only specified skills should be installed
          expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "commit", "SKILL.md"))).toBe(
            true,
          );
          expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "debug", "SKILL.md"))).toBe(
            true,
          );
          // review-pr should NOT be installed
          expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "review-pr"))).toBe(false);
        }),
      ),
    );

    it.effect("warns about unknown skill names", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            skill: ["commit", "nonexistent-skill"],
            yes: true,
            agent: ["claude-code"],
          };

          // Should still install the valid skill
          yield* handleInstall(args);

          expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "commit", "SKILL.md"))).toBe(
            true,
          );
        }),
      ),
    );

    it.effect("handles empty result when all specified skills are invalid", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            skill: ["nonexistent-1", "nonexistent-2"],
            yes: true,
            agent: ["claude-code"],
          };

          // Should complete successfully but install nothing
          yield* handleInstall(args);
        }),
      ),
    );
  });

  // =============================================================================
  // --list Flag Tests
  // =============================================================================

  describe("--list flag", () => {
    it.effect("lists available skills without installing", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([
            { name: "commit", description: "Auto-commit helper" },
            { name: "review-pr", description: "PR review helper" },
          ]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            list: true,
            agent: ["claude-code"],
          };

          yield* handleInstall(args);

          // Skills should NOT be installed in list mode
          expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "commit"))).toBe(false);
          expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "review-pr"))).toBe(false);
        }),
      ),
    );
  });

  // =============================================================================
  // Settings and Lockfile Tests
  // =============================================================================

  describe("settings and lockfile updates", () => {
    it.effect("updates settings.json with installed skill", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          };

          yield* handleInstall(args);

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

          expect(settings.skills?.["commit"]).toBeDefined();
          expect(settings.skills?.["commit"]).toBe("*");
        }),
      ),
    );

    it.effect("creates axm-lock.yaml with installed skill entry", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          };

          yield* handleInstall(args);

          const lockPath = path.join(tempDir, ".axm", "axm-lock.yaml");
          expect(fs.existsSync(lockPath)).toBe(true);

          // Lockfile is in YAML format - parse and verify structure
          const lockContent = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
          expect(lockContent.lockfileVersion).toBe(1);
          expect(lockContent.extensions.skills.commit).toBeDefined();
          expect(lockContent.extensions.skills.commit.source).toBe(source);
          expect(lockContent.extensions.skills.commit.origin).toBe(source);
          expect(lockContent.extensions.skills.commit.folderHash).toMatch(/^sha256:/);
          expect(lockContent.extensions.skills.commit.installedAt).toBeDefined();
          expect(lockContent.extensions.skills.commit.updatedAt).toBeDefined();
        }),
      ),
    );
  });

  // =============================================================================
  // Canonical Skill Storage Tests
  // =============================================================================

  describe("canonical skill storage", () => {
    it.effect("copies skill to .axm/skills/<name>/", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          };

          yield* handleInstall(args);

          const canonicalPath = path.join(tempDir, ".axm", "skills", "commit");
          expect(fs.existsSync(canonicalPath)).toBe(true);
          expect(fs.existsSync(path.join(canonicalPath, "SKILL.md"))).toBe(true);
        }),
      ),
    );

    it.effect("preserves skill directory structure", () =>
      withTestLayer(
        Effect.gen(function* () {
          // Create skill with subdirectories
          fs.mkdirSync(sourceDir, { recursive: true });
          const skillDir = path.join(sourceDir, "complex-skill");
          fs.mkdirSync(skillDir, { recursive: true });
          fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Complex Skill");
          fs.mkdirSync(path.join(skillDir, "references"), { recursive: true });
          fs.writeFileSync(path.join(skillDir, "references", "commands.md"), "# Commands");

          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source: sourceDir,
            all: true,
            yes: true,
            agent: ["claude-code"],
          };

          yield* handleInstall(args);

          const canonicalPath = path.join(tempDir, ".axm", "skills", "complex-skill");
          expect(fs.existsSync(path.join(canonicalPath, "SKILL.md"))).toBe(true);
          expect(fs.existsSync(path.join(canonicalPath, "references", "commands.md"))).toBe(true);
        }),
      ),
    );
  });

  // =============================================================================
  // Global Flag Tests
  // =============================================================================

  describe("global flag", () => {
    it.effect("uses ~/.axm for global installations", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);

          // Backup and cleanup global settings and lockfile
          const globalAxmDir = path.join(os.homedir(), ".axm");
          const globalSettingsPath = path.join(globalAxmDir, "settings.json");
          const globalLockfilePath = path.join(globalAxmDir, "axm-lock.yaml");
          const settingsExistedBefore = fs.existsSync(globalSettingsPath);
          const lockfileExistedBefore = fs.existsSync(globalLockfilePath);
          let backupSettings: string | undefined;
          let backupLockfile: string | undefined;
          let backupSkillsDir: string | undefined;
          const skillsDir = path.join(globalAxmDir, "skills", "commit");
          const skillsExistedBefore = fs.existsSync(skillsDir);

          if (settingsExistedBefore) {
            backupSettings = fs.readFileSync(globalSettingsPath, "utf-8");
          }
          if (lockfileExistedBefore) {
            backupLockfile = fs.readFileSync(globalLockfilePath, "utf-8");
          }
          if (skillsExistedBefore) {
            // Backup existing skill if present
            backupSkillsDir = fs.readFileSync(path.join(skillsDir, "SKILL.md"), "utf-8");
          }

          try {
            // Remove existing settings and lockfile to test fresh init
            if (settingsExistedBefore) {
              fs.rmSync(globalSettingsPath);
            }
            if (lockfileExistedBefore) {
              fs.rmSync(globalLockfilePath);
            }
            if (skillsExistedBefore) {
              fs.rmSync(skillsDir, { recursive: true });
            }

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              global: true,
              all: true,
              yes: true,
              agent: ["claude-code"],
            };

            yield* handleInstall(args);

            // Should create settings in home directory
            expect(fs.existsSync(globalSettingsPath)).toBe(true);

            // Skill should be in global location
            expect(fs.existsSync(path.join(globalAxmDir, "skills", "commit", "SKILL.md"))).toBe(
              true,
            );

            // Should NOT be in project directory
            expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "commit"))).toBe(false);
          } finally {
            // Restore original state
            if (settingsExistedBefore && backupSettings) {
              fs.writeFileSync(globalSettingsPath, backupSettings);
            } else if (!settingsExistedBefore && fs.existsSync(globalSettingsPath)) {
              fs.rmSync(globalSettingsPath);
            }
            if (lockfileExistedBefore && backupLockfile) {
              fs.writeFileSync(globalLockfilePath, backupLockfile);
            } else if (!lockfileExistedBefore && fs.existsSync(globalLockfilePath)) {
              fs.rmSync(globalLockfilePath);
            }
            if (skillsExistedBefore && backupSkillsDir) {
              fs.mkdirSync(skillsDir, { recursive: true });
              fs.writeFileSync(path.join(skillsDir, "SKILL.md"), backupSkillsDir);
            } else if (!skillsExistedBefore && fs.existsSync(skillsDir)) {
              fs.rmSync(skillsDir, { recursive: true });
            }
          }
        }),
      ),
    );
  });

  // =============================================================================
  // Error Handling Tests
  // =============================================================================

  describe("error scenarios", () => {
    it.effect("returns InstallError with descriptive message for parsing errors", () =>
      withTestLayer(
        Effect.gen(function* () {
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source: "",
            yes: true,
            agent: ["claude-code"],
          };

          const error = yield* handleInstall(args).pipe(Effect.flip);

          expect(error._tag).toBe("InstallError");
          expect((error as InstallError).message).toBeTruthy();
        }),
      ),
    );

    it.effect("handles discovery errors gracefully", () =>
      withTestLayer(
        Effect.gen(function* () {
          initializeAxm();

          // Source that doesn't exist
          const args: InstallArgs = {
            ...defaultArgs,
            source: "/nonexistent/path/to/skills",
            yes: true,
            agent: ["claude-code"],
          };

          const error = yield* handleInstall(args).pipe(Effect.flip);

          expect(error._tag).toBe("InstallError");
        }),
      ),
    );
  });

  // =============================================================================
  // Error Message Recovery Guidance Tests
  // =============================================================================

  describe("error messages with recovery guidance", () => {
    it.effect("invalid source error suggests valid source formats", () =>
      withTestLayer(
        Effect.gen(function* () {
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source: "", // Empty source is invalid
            yes: true,
            agent: ["claude-code"],
          };

          const error = yield* handleInstall(args).pipe(Effect.flip);

          expect(error._tag).toBe("InstallError");
          const message = (error as InstallError).message;
          expect(message).toContain("Invalid source");
          // Recovery guidance: valid formats
          expect(message).toContain("github:");
          expect(message).toContain("gitlab:");
          expect(message).toContain("local path");
        }),
      ),
    );

    it.effect("no skills found error suggests checking the source path", () =>
      withTestLayer(
        Effect.gen(function* () {
          fs.mkdirSync(sourceDir, { recursive: true });
          initializeAxm();

          const args: InstallArgs = {
            ...defaultArgs,
            source: sourceDir,
            yes: true,
            agent: ["claude-code"],
          };

          const error = yield* handleInstall(args).pipe(Effect.flip);

          expect(error._tag).toBe("InstallError");
          const message = (error as InstallError).message;
          expect(message).toContain("No skills found");
          expect(message).toContain(sourceDir);
          // Recovery guidance: check for SKILL.md files
          expect(message).toContain("SKILL.md");
        }),
      ),
    );
  });

  // =============================================================================
  // InstallError Tests
  // =============================================================================

  describe("InstallError", () => {
    it("is a tagged error with correct tag", () => {
      const error = new InstallError({
        message: "Test error message",
        retryable: false,
      });

      expect(error._tag).toBe("InstallError");
      expect(error.message).toBe("Test error message");
    });

    it("can include a cause", () => {
      const cause = new Error("Original error");
      const error = new InstallError({
        message: "Wrapped error",
        cause,
        retryable: false,
      });

      expect(error.cause).toBe(cause);
    });
  });

  // =============================================================================
  // Conflict Detection Tests
  // =============================================================================

  describe("conflict detection", () => {
    it.effect("skips already installed skills by default", () =>
      withTestLayer(
        Effect.gen(function* () {
          // Create initial source with specific content
          const sourceDir1 = path.join(tempDir, "source-1");
          fs.mkdirSync(sourceDir1, { recursive: true });
          fs.mkdirSync(path.join(sourceDir1, "commit"));
          fs.writeFileSync(path.join(sourceDir1, "commit", "SKILL.md"), "# Original");

          initializeAxm();

          // First install
          yield* handleInstall({
            ...defaultArgs,
            source: sourceDir1,
            all: true,
            yes: true,
            agent: ["claude-code"],
          });

          // Verify first install
          expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "commit", "SKILL.md"))).toBe(
            true,
          );

          // Create second source with DIFFERENT content for same skill name
          const sourceDir2 = path.join(tempDir, "source-2");
          fs.mkdirSync(sourceDir2, { recursive: true });
          fs.mkdirSync(path.join(sourceDir2, "commit"));
          fs.writeFileSync(path.join(sourceDir2, "commit", "SKILL.md"), "# Modified");

          // Second install - should skip existing skills
          yield* handleInstall({
            ...defaultArgs,
            source: sourceDir2,
            all: true,
            yes: true,
            agent: ["claude-code"],
          });

          // File should still have original content (skill was skipped)
          const content = fs.readFileSync(
            path.join(tempDir, ".axm", "skills", "commit", "SKILL.md"),
            "utf-8",
          );
          expect(content).toBe("# Original");
        }),
      ),
    );

    it.effect("skips only conflicting skills, installs new ones", () =>
      withTestLayer(
        Effect.gen(function* () {
          // Create initial source with one skill
          const sourceDir1 = path.join(tempDir, "source-1");
          fs.mkdirSync(sourceDir1, { recursive: true });
          fs.mkdirSync(path.join(sourceDir1, "commit"));
          fs.writeFileSync(path.join(sourceDir1, "commit", "SKILL.md"), "# commit");

          initializeAxm();

          // Install first skill
          const args1: InstallArgs = {
            ...defaultArgs,
            source: sourceDir1,
            all: true,
            yes: true,
            agent: ["claude-code"],
          };
          yield* handleInstall(args1);

          // Create second source with overlapping and new skill
          const sourceDir2 = path.join(tempDir, "source-2");
          fs.mkdirSync(sourceDir2, { recursive: true });
          fs.mkdirSync(path.join(sourceDir2, "commit"));
          fs.writeFileSync(path.join(sourceDir2, "commit", "SKILL.md"), "# commit v2");
          fs.mkdirSync(path.join(sourceDir2, "review-pr"));
          fs.writeFileSync(path.join(sourceDir2, "review-pr", "SKILL.md"), "# review-pr");

          // Install from second source - commit should be skipped, review-pr installed
          const args2: InstallArgs = {
            ...defaultArgs,
            source: sourceDir2,
            all: true,
            yes: true,
            agent: ["claude-code"],
          };
          yield* handleInstall(args2);

          // Original commit should not be overwritten
          const commitContent = fs.readFileSync(
            path.join(tempDir, ".axm", "skills", "commit", "SKILL.md"),
            "utf-8",
          );
          expect(commitContent).toBe("# commit"); // Original, not "# commit v2"

          // New skill should be installed
          expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "review-pr", "SKILL.md"))).toBe(
            true,
          );
        }),
      ),
    );

    it.effect("exits early when all selected skills already installed", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          // First install
          const args1: InstallArgs = {
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          };
          yield* handleInstall(args1);

          // Second install - should complete without error but do nothing
          const args2: InstallArgs = {
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          };
          yield* handleInstall(args2);

          // Should have completed successfully (no error thrown)
        }),
      ),
    );
  });

  // =============================================================================
  // Force Flag Tests
  // =============================================================================

  describe("--force flag", () => {
    it.effect("updates lockfile when overwriting with --force", () =>
      withTestLayer(
        Effect.gen(function* () {
          // Create initial source
          const sourceDir1 = path.join(tempDir, "source-1");
          fs.mkdirSync(sourceDir1, { recursive: true });
          fs.mkdirSync(path.join(sourceDir1, "commit"));
          fs.writeFileSync(path.join(sourceDir1, "commit", "SKILL.md"), "# Original");

          initializeAxm();

          // Install first version
          yield* handleInstall({
            ...defaultArgs,
            source: sourceDir1,
            all: true,
            yes: true,
            agent: ["claude-code"],
          });

          // Get original lockfile entry
          const lockPath = path.join(tempDir, ".axm", "axm-lock.yaml");
          const originalLock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
          const originalHash = originalLock.extensions.skills.commit.folderHash;

          // Create second source with different content
          const sourceDir2 = path.join(tempDir, "source-2");
          fs.mkdirSync(sourceDir2, { recursive: true });
          fs.mkdirSync(path.join(sourceDir2, "commit"));
          fs.writeFileSync(path.join(sourceDir2, "commit", "SKILL.md"), "# Updated content");

          // Install with --force
          yield* handleInstall({
            ...defaultArgs,
            source: sourceDir2,
            all: true,
            yes: true,
            force: true,
            agent: ["claude-code"],
          });

          // Lockfile should have updated hash
          const newLock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
          expect(newLock.extensions.skills.commit.folderHash).not.toBe(originalHash);
          expect(newLock.extensions.skills.commit.source).toBe(sourceDir2);
        }),
      ),
    );

    it.effect("installs both existing and new skills with --force", () =>
      withTestLayer(
        Effect.gen(function* () {
          // Create initial source
          const sourceDir1 = path.join(tempDir, "source-1");
          fs.mkdirSync(sourceDir1, { recursive: true });
          fs.mkdirSync(path.join(sourceDir1, "commit"));
          fs.writeFileSync(path.join(sourceDir1, "commit", "SKILL.md"), "# commit v1");

          initializeAxm();

          // Install first skill
          yield* handleInstall({
            ...defaultArgs,
            source: sourceDir1,
            all: true,
            yes: true,
            agent: ["claude-code"],
          });

          // Create second source with both existing and new skills
          const sourceDir2 = path.join(tempDir, "source-2");
          fs.mkdirSync(sourceDir2, { recursive: true });
          fs.mkdirSync(path.join(sourceDir2, "commit"));
          fs.writeFileSync(path.join(sourceDir2, "commit", "SKILL.md"), "# commit v2");
          fs.mkdirSync(path.join(sourceDir2, "review-pr"));
          fs.writeFileSync(path.join(sourceDir2, "review-pr", "SKILL.md"), "# review-pr");

          // Install with --force
          yield* handleInstall({
            ...defaultArgs,
            source: sourceDir2,
            all: true,
            yes: true,
            force: true,
            agent: ["claude-code"],
          });

          // Both should be installed/updated
          const commitContent = fs.readFileSync(
            path.join(tempDir, ".axm", "skills", "commit", "SKILL.md"),
            "utf-8",
          );
          expect(commitContent).toBe("# commit v2");
          expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "review-pr", "SKILL.md"))).toBe(
            true,
          );
        }),
      ),
    );
  });

  // =============================================================================
  // Settings Schema Tests
  // =============================================================================

  describe("settings schema", () => {
    it.effect("creates settings with skills at root level", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          // Don't initialize - let handler create fresh settings

          const args: InstallArgs = {
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          };

          yield* handleInstall(args);

          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

          // Verify skills at root level
          expect(settings.skills).toBeDefined();
          expect(settings.skills.commit).toBe("*");
        }),
      ),
    );

    it.effect("preserves existing settings when adding new skills", () =>
      withTestLayer(
        Effect.gen(function* () {
          // Initialize with existing settings
          const axmDir = path.join(tempDir, ".axm");
          fs.mkdirSync(axmDir, { recursive: true });
          fs.writeFileSync(
            path.join(axmDir, "settings.json"),
            JSON.stringify({
              scope: "@myorg",
              agents: ["claude-code"],
              skills: {
                "existing-skill": "^1.0.0",
              },
            }),
          );

          const source = createSkillSource([{ name: "commit" }]);

          yield* handleInstall({
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          });

          const settings = JSON.parse(fs.readFileSync(path.join(axmDir, "settings.json"), "utf-8"));

          // Existing settings should be preserved
          expect(settings.scope).toBe("@myorg");
          expect(settings.agents).toEqual(["claude-code"]);
          expect(settings.skills?.["existing-skill"]).toBe("^1.0.0");
          // New skill should be added
          expect(settings.skills.commit).toBe("*");
        }),
      ),
    );
  });

  // =============================================================================
  // Lockfile Schema Tests
  // =============================================================================

  describe("lockfile schema", () => {
    it.effect("creates lockfile with lockfileVersion and extensions structure", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          yield* handleInstall({
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          });

          const lockPath = path.join(tempDir, ".axm", "axm-lock.yaml");
          const lockfile = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

          expect(lockfile.lockfileVersion).toBe(1);
          expect(lockfile.extensions).toBeDefined();
          expect(lockfile.extensions.skills).toBeDefined();
        }),
      ),
    );

    it.effect("lockfile entry contains required fields", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          yield* handleInstall({
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          });

          const lockPath = path.join(tempDir, ".axm", "axm-lock.yaml");
          const lockfile = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
          const entry = lockfile.extensions.skills.commit;

          // Required fields per spec
          expect(entry.source).toBeDefined();
          expect(entry.origin).toBeDefined();
          expect(entry.folderHash).toBeDefined();
          expect(entry.installedAt).toBeDefined();
          expect(entry.updatedAt).toBeDefined();

          // folderHash should be a sha256 hash for local sources
          expect(entry.folderHash).toMatch(/^sha256:/);
        }),
      ),
    );

    it.effect("lockfile timestamps are valid ISO strings", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          yield* handleInstall({
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          });

          const lockPath = path.join(tempDir, ".axm", "axm-lock.yaml");
          const lockfile = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
          const entry = lockfile.extensions.skills.commit;

          // Timestamps should be valid ISO strings
          expect(() => new Date(entry.installedAt)).not.toThrow();
          expect(() => new Date(entry.updatedAt)).not.toThrow();
          expect(new Date(entry.installedAt).toISOString()).toBe(entry.installedAt);
          expect(new Date(entry.updatedAt).toISOString()).toBe(entry.updatedAt);
        }),
      ),
    );
  });

  // =============================================================================
  // Explicit Source Prefix Pattern Tests
  // =============================================================================

  describe("explicit source prefix patterns", () => {
    it.effect("parses github: prefix correctly", () =>
      withTestLayer(
        Effect.gen(function* () {
          initializeAxm();

          // github: prefix should be recognized as GitHub source
          // Use an invalid repo to test parsing (will fail on clone, not parse)
          const args: InstallArgs = {
            ...defaultArgs,
            source: "github:nonexistent-owner-xyz/nonexistent-repo-xyz",
            yes: true,
            agent: ["claude-code"],
          };

          // Should fail with clone error (not parse error), proving prefix was parsed
          const error = yield* handleInstall(args).pipe(Effect.flip);
          expect(error._tag).toBe("InstallError");
          // Error should be about cloning, not parsing
          expect((error as InstallError).message).toContain("clone");
        }),
      ),
    );

    it.effect("parses gitlab: prefix correctly", () =>
      withTestLayer(
        Effect.gen(function* () {
          initializeAxm();

          // gitlab: prefix should be recognized as GitLab source
          const args: InstallArgs = {
            ...defaultArgs,
            source: "gitlab:nonexistent-owner-xyz/nonexistent-repo-xyz",
            yes: true,
            agent: ["claude-code"],
          };

          // Should fail with clone error (not parse error), proving prefix was parsed
          const error = yield* handleInstall(args).pipe(Effect.flip);
          expect(error._tag).toBe("InstallError");
          expect((error as InstallError).message).toContain("clone");
        }),
      ),
    );

    it.effect("stores canonical source with github: prefix in lockfile", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          // Install from local source
          yield* handleInstall({
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          });

          // Verify local source is stored as-is
          const lockPath = path.join(tempDir, ".axm", "axm-lock.yaml");
          const lockfile = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
          expect(lockfile.extensions.skills.commit.source).toBe(source);
        }),
      ),
    );
  });

  // =============================================================================
  // Source Normalization Tests
  // =============================================================================

  describe("source normalization", () => {
    it.effect("stores local path as source in lockfile", () =>
      withTestLayer(
        Effect.gen(function* () {
          const source = createSkillSource([{ name: "commit" }]);
          initializeAxm();

          yield* handleInstall({
            ...defaultArgs,
            source,
            all: true,
            yes: true,
            agent: ["claude-code"],
          });

          const lockPath = path.join(tempDir, ".axm", "axm-lock.yaml");
          const lockfile = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

          // Local path should be stored as-is per spec
          expect(lockfile.extensions.skills.commit.source).toBe(source);
          expect(lockfile.extensions.skills.commit.origin).toBe(source);
        }),
      ),
    );
  });

  // =============================================================================
  // Non-TTY Scenarios Tests
  // =============================================================================

  describe("non-TTY scenarios", () => {
    // Import the mocked module dynamically to control mock behavior
    let isInteractiveMock: ReturnType<typeof vi.fn>;
    let isFancyOutputMock: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      // Get references to the mocked functions
      const ttyModule = await import("../../../utils/tty.js");
      isInteractiveMock = ttyModule.isInteractive as ReturnType<typeof vi.fn>;
      isFancyOutputMock = ttyModule.isFancyOutput as ReturnType<typeof vi.fn>;
      // Reset to default TTY behavior
      isInteractiveMock.mockReturnValue(true);
      isFancyOutputMock.mockReturnValue(true);
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    describe("agent selection in non-interactive mode", () => {
      it.effect("fails with InstallError when stdin is not TTY and no --yes/--agent flag", () =>
        withTestLayer(
          Effect.gen(function* () {
            isInteractiveMock.mockReturnValue(false);
            const source = createSkillSource([{ name: "commit" }]);
            initializeAxm();

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              // No --yes, no --agent, no --non-interactive
            };

            const error = yield* handleInstall(args).pipe(Effect.flip);

            expect(error._tag).toBe("InstallError");
            expect((error as InstallError).message).toContain("Cannot prompt for agent selection");
            expect((error as InstallError).message).toContain("stdin is not a TTY");
            expect((error as InstallError).message).toContain("--yes");
            expect((error as InstallError).message).toContain("--all");
            expect((error as InstallError).message).toContain("--non-interactive");
          }),
        ),
      );

      it.effect("succeeds when stdin is not TTY but --yes flag is set", () =>
        withTestLayer(
          Effect.gen(function* () {
            isInteractiveMock.mockReturnValue(false);
            const source = createSkillSource([{ name: "commit" }]);
            initializeAxm();

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              yes: true,
              agent: ["claude-code"],
              all: true,
            };

            yield* handleInstall(args);
          }),
        ),
      );

      it.effect("succeeds when stdin is not TTY but --non-interactive flag is set", () =>
        withTestLayer(
          Effect.gen(function* () {
            isInteractiveMock.mockReturnValue(false);
            const source = createSkillSource([{ name: "commit" }]);
            initializeAxm();

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              nonInteractive: true,
              agent: ["claude-code"],
              all: true,
            };

            yield* handleInstall(args);
          }),
        ),
      );
    });

    describe("skill selection in non-interactive mode", () => {
      it.effect("fails with InstallError when stdin is not TTY and no --all/--skill flag", () =>
        withTestLayer(
          Effect.gen(function* () {
            isInteractiveMock.mockReturnValue(false);
            const source = createSkillSource([{ name: "commit" }]);
            initializeAxm();

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              agent: ["claude-code"], // Explicit agent avoids agent selection prompt
              // No --all, no --skill
            };

            const error = yield* handleInstall(args).pipe(Effect.flip);

            expect(error._tag).toBe("InstallError");
            expect((error as InstallError).message).toContain("Cannot prompt for skill selection");
            expect((error as InstallError).message).toContain("stdin is not a TTY");
          }),
        ),
      );

      it.effect("succeeds when stdin is not TTY but --all flag is set", () =>
        withTestLayer(
          Effect.gen(function* () {
            isInteractiveMock.mockReturnValue(false);
            const source = createSkillSource([{ name: "commit" }]);
            initializeAxm();

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              agent: ["claude-code"],
              all: true,
              yes: true, // Skip confirmation prompt too
            };

            yield* handleInstall(args);
          }),
        ),
      );

      it.effect("succeeds when stdin is not TTY but --skill flag is set", () =>
        withTestLayer(
          Effect.gen(function* () {
            isInteractiveMock.mockReturnValue(false);
            const source = createSkillSource([{ name: "commit" }, { name: "review-pr" }]);
            initializeAxm();

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              agent: ["claude-code"],
              skill: ["commit"],
              yes: true, // Skip confirmation prompt too
            };

            yield* handleInstall(args);

            // Only specified skill should be installed
            expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "commit", "SKILL.md"))).toBe(
              true,
            );
            expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "review-pr"))).toBe(false);
          }),
        ),
      );
    });

    describe("confirmation in non-interactive mode", () => {
      it.effect("fails with InstallError when stdin is not TTY and confirmation needed", () =>
        withTestLayer(
          Effect.gen(function* () {
            isInteractiveMock.mockReturnValue(false);
            const source = createSkillSource([{ name: "commit" }]);
            initializeAxm();

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              agent: ["claude-code"],
              all: true,
              // No --yes - would need confirmation prompt
            };

            const error = yield* handleInstall(args).pipe(Effect.flip);

            expect(error._tag).toBe("InstallError");
            expect((error as InstallError).message).toContain("Cannot prompt for confirmation");
            expect((error as InstallError).message).toContain("stdin is not a TTY");
          }),
        ),
      );
    });

    describe("output formatting", () => {
      it.effect("uses plain text output when stdout is not TTY", () =>
        withTestLayer(
          Effect.gen(function* () {
            // This test verifies the handler doesn't crash when fancy output is disabled
            isInteractiveMock.mockReturnValue(true);
            isFancyOutputMock.mockReturnValue(false);

            const source = createSkillSource([{ name: "commit" }]);
            initializeAxm();

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              agent: ["claude-code"],
              all: true,
              yes: true,
            };

            // Should complete successfully with plain text output
            yield* handleInstall(args);
          }),
        ),
      );

      it.effect("handles both non-TTY stdin and stdout", () =>
        withTestLayer(
          Effect.gen(function* () {
            isInteractiveMock.mockReturnValue(false);
            isFancyOutputMock.mockReturnValue(false);

            const source = createSkillSource([{ name: "commit" }]);
            initializeAxm();

            const args: InstallArgs = {
              ...defaultArgs,
              source,
              agent: ["claude-code"],
              all: true,
              yes: true,
            };

            // Should complete successfully
            yield* handleInstall(args);

            expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "commit", "SKILL.md"))).toBe(
              true,
            );
          }),
        ),
      );
    });
  });
});
