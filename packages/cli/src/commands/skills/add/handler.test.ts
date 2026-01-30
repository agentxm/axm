/**
 * Unit tests for the add command handler.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Settings } from "@agentxm/core/experimental/skills";
import { FetchHttpClient, type FileSystem, type HttpClient, type Path } from "@effect/platform";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Effect, Layer } from "effect";

// Layer providing all required services for tests
const TestLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer, FetchHttpClient.layer);

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AddArgs, AddError, handleAdd } from "./handler.js";

// Mock TTY utilities
vi.mock("../../../utils/tty.js", () => ({
  isInteractive: vi.fn(() => true),
  isFancyOutput: vi.fn(() => true),
}));

describe("add.handler", () => {
  let tempDir: string;
  let originalCwd: string;
  let sourceDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "add-handler-test-"));
    sourceDir = path.join(tempDir, "source-skills");
    // Change to temp dir so .axm is created there
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Run handler with real FileSystem, Path, and HttpClient services.
   */
  const runHandler = <A, E>(
    effect: Effect.Effect<A, E, FileSystem.FileSystem | HttpClient.HttpClient | Path.Path>,
  ) => Effect.runPromise(effect.pipe(Effect.provide(TestLayer)));

  /**
   * Run handler and return Either for error assertions.
   */
  const runHandlerEither = <A, E>(
    effect: Effect.Effect<A, E, FileSystem.FileSystem | HttpClient.HttpClient | Path.Path>,
  ) => Effect.runPromise(effect.pipe(Effect.either, Effect.provide(TestLayer)));

  const defaultArgs: AddArgs = {
    source: "",
    global: false,
    agent: [],
    skill: [],
    yes: false,
    list: false,
    all: false,
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

    const settings: Settings = {
      version: 1,
      agents,
      skills: {},
    };

    fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings, null, 2));
  };

  describe("source parsing", () => {
    it("fails with AddError for invalid source format", async () => {
      initializeAxm();
      const args: AddArgs = {
        ...defaultArgs,
        source: "", // Empty source is invalid
        yes: true,
        agent: ["claude-code"],
      };

      const result = await runHandlerEither(handleAdd(args));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("AddError");
        expect((result.left as AddError).message).toContain("Invalid source");
      }
    });

    it("recognizes local path source type", async () => {
      const source = createSkillSource([{ name: "commit" }]);
      initializeAxm();

      // Just verify it doesn't fail on parsing - we test list mode to avoid agent selection
      const args: AddArgs = {
        ...defaultArgs,
        source,
        list: true,
        agent: ["claude-code"],
      };

      const result = await runHandlerEither(handleAdd(args));

      // Should succeed (list mode doesn't install)
      expect(result._tag).toBe("Right");
    });
  });

  describe("local source discovery", () => {
    it("discovers skills from local path", async () => {
      const source = createSkillSource([
        { name: "commit", description: "Auto-commit helper" },
        { name: "review-pr", description: "PR review helper" },
      ]);
      initializeAxm();

      // Use list mode to see discovered skills without installing
      const args: AddArgs = {
        ...defaultArgs,
        source,
        list: true,
        agent: ["claude-code"],
      };

      const result = await runHandlerEither(handleAdd(args));

      expect(result._tag).toBe("Right");
    });

    it("handles empty source directory with error and recovery guidance", async () => {
      fs.mkdirSync(sourceDir, { recursive: true });
      initializeAxm();

      const args: AddArgs = {
        ...defaultArgs,
        source: sourceDir,
        yes: true,
        agent: ["claude-code"],
      };

      // Should fail with error suggesting to check the source path
      const result = await runHandlerEither(handleAdd(args));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("AddError");
        expect((result.left as AddError).message).toContain("No skills found");
        expect((result.left as AddError).message).toContain(sourceDir);
        expect((result.left as AddError).message).toContain("SKILL.md");
      }
    });

    it("handles non-existent source path", async () => {
      initializeAxm();

      const args: AddArgs = {
        ...defaultArgs,
        source: path.join(tempDir, "nonexistent-dir"),
        yes: true,
        agent: ["claude-code"],
      };

      const result = await runHandlerEither(handleAdd(args));

      // Should fail with error about discovering skills
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("AddError");
      }
    });
  });

  describe("agent handling", () => {
    it("uses explicitly specified agents via --agent flag", async () => {
      const source = createSkillSource([{ name: "commit" }]);
      initializeAxm();

      const args: AddArgs = {
        ...defaultArgs,
        source,
        agent: ["claude-code"],
        all: true,
        yes: true,
      };

      const result = await runHandlerEither(handleAdd(args));

      expect(result._tag).toBe("Right");

      // Verify skill was installed to canonical location
      const canonicalSkillPath = path.join(tempDir, ".axm", "skills", "commit", "SKILL.md");
      expect(fs.existsSync(canonicalSkillPath)).toBe(true);
    });

    it("warns about invalid agent IDs", async () => {
      const source = createSkillSource([{ name: "commit" }]);
      initializeAxm();

      const args: AddArgs = {
        ...defaultArgs,
        source,
        agent: ["invalid-agent-xyz"],
        all: true,
        yes: true,
      };

      // With invalid agent, should complete but not install to any agent
      const result = await runHandlerEither(handleAdd(args));

      // Handler completes without error (just warns about invalid agents)
      expect(result._tag).toBe("Right");
    });

    it("handles mix of valid and invalid agent IDs", async () => {
      const source = createSkillSource([{ name: "commit" }]);
      initializeAxm();

      const args: AddArgs = {
        ...defaultArgs,
        source,
        agent: ["claude-code", "invalid-agent"],
        all: true,
        yes: true,
      };

      const result = await runHandlerEither(handleAdd(args));

      // Should succeed with valid agent
      expect(result._tag).toBe("Right");
    });
  });

  describe("non-interactive mode with --yes flag", () => {
    it("skips agent selection prompt with --yes", async () => {
      const source = createSkillSource([{ name: "commit" }]);
      initializeAxm();

      const args: AddArgs = {
        ...defaultArgs,
        source,
        yes: true,
        agent: ["claude-code"],
        all: true,
      };

      // Should complete without prompting
      const result = await runHandlerEither(handleAdd(args));

      expect(result._tag).toBe("Right");
    });

    it("skips skill selection prompt with --yes and --all", async () => {
      const source = createSkillSource([{ name: "commit" }, { name: "review-pr" }]);
      initializeAxm();

      const args: AddArgs = {
        ...defaultArgs,
        source,
        yes: true,
        agent: ["claude-code"],
        all: true,
      };

      const result = await runHandlerEither(handleAdd(args));

      expect(result._tag).toBe("Right");

      // Both skills should be installed
      expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "commit", "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "review-pr", "SKILL.md"))).toBe(
        true,
      );
    });

    it("skips confirmation prompt with --yes", async () => {
      const source = createSkillSource([{ name: "commit" }]);
      initializeAxm();

      const args: AddArgs = {
        ...defaultArgs,
        source,
        yes: true,
        agent: ["claude-code"],
        all: true,
      };

      const result = await runHandlerEither(handleAdd(args));

      expect(result._tag).toBe("Right");
    });
  });

  describe("--all flag", () => {
    it("installs all discovered skills with --all", async () => {
      const source = createSkillSource([
        { name: "skill-1" },
        { name: "skill-2" },
        { name: "skill-3" },
      ]);
      initializeAxm();

      const args: AddArgs = {
        ...defaultArgs,
        source,
        all: true,
        yes: true,
        agent: ["claude-code"],
      };

      const result = await runHandlerEither(handleAdd(args));

      expect(result._tag).toBe("Right");

      // All skills should be installed
      expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "skill-1", "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "skill-2", "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "skill-3", "SKILL.md"))).toBe(true);
    });
  });

  describe("--skill flag for specific skills", () => {
    it("installs only specified skills with --skill", async () => {
      const source = createSkillSource([
        { name: "commit" },
        { name: "review-pr" },
        { name: "debug" },
      ]);
      initializeAxm();

      const args: AddArgs = {
        ...defaultArgs,
        source,
        skill: ["commit", "debug"],
        yes: true,
        agent: ["claude-code"],
      };

      const result = await runHandlerEither(handleAdd(args));

      expect(result._tag).toBe("Right");

      // Only specified skills should be installed
      expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "commit", "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "debug", "SKILL.md"))).toBe(true);
      // review-pr should NOT be installed
      expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "review-pr"))).toBe(false);
    });

    it("warns about unknown skill names", async () => {
      const source = createSkillSource([{ name: "commit" }]);
      initializeAxm();

      const args: AddArgs = {
        ...defaultArgs,
        source,
        skill: ["commit", "nonexistent-skill"],
        yes: true,
        agent: ["claude-code"],
      };

      // Should still install the valid skill
      const result = await runHandlerEither(handleAdd(args));

      expect(result._tag).toBe("Right");
      expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "commit", "SKILL.md"))).toBe(true);
    });

    it("handles empty result when all specified skills are invalid", async () => {
      const source = createSkillSource([{ name: "commit" }]);
      initializeAxm();

      const args: AddArgs = {
        ...defaultArgs,
        source,
        skill: ["nonexistent-1", "nonexistent-2"],
        yes: true,
        agent: ["claude-code"],
      };

      // Should complete successfully but install nothing
      const result = await runHandlerEither(handleAdd(args));

      expect(result._tag).toBe("Right");
    });
  });

  describe("--list flag", () => {
    it("lists available skills without installing", async () => {
      const source = createSkillSource([
        { name: "commit", description: "Auto-commit helper" },
        { name: "review-pr", description: "PR review helper" },
      ]);
      initializeAxm();

      const args: AddArgs = {
        ...defaultArgs,
        source,
        list: true,
        agent: ["claude-code"],
      };

      const result = await runHandlerEither(handleAdd(args));

      expect(result._tag).toBe("Right");

      // Skills should NOT be installed in list mode
      expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "commit"))).toBe(false);
      expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "review-pr"))).toBe(false);
    });
  });

  describe("settings and lockfile updates", () => {
    it("updates settings.json with installed skill", async () => {
      const source = createSkillSource([{ name: "commit" }]);
      initializeAxm();

      const args: AddArgs = {
        ...defaultArgs,
        source,
        all: true,
        yes: true,
        agent: ["claude-code"],
      };

      await runHandler(handleAdd(args));

      const settingsPath = path.join(tempDir, ".axm", "settings.json");
      const settings: Settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

      expect(settings.skills["commit"]).toBeDefined();
      expect(settings.skills["commit"]?.source).toBe(source);
      expect(settings.skills["commit"]?.agents).toContain("claude-code");
    });

    it("creates axm.lock with installed skill entry", async () => {
      const source = createSkillSource([{ name: "commit" }]);
      initializeAxm();

      const args: AddArgs = {
        ...defaultArgs,
        source,
        all: true,
        yes: true,
        agent: ["claude-code"],
      };

      await runHandler(handleAdd(args));

      const lockPath = path.join(tempDir, ".axm", "axm.lock");
      expect(fs.existsSync(lockPath)).toBe(true);

      // Lockfile is in YAML format - verify content via text matching
      const lockContent = fs.readFileSync(lockPath, "utf-8");
      expect(lockContent).toContain("version: 1");
      expect(lockContent).toContain("skills:");
      expect(lockContent).toContain("commit:");
      expect(lockContent).toContain(`source: ${source}`);
      expect(lockContent).toMatch(/contentHash: sha256:/);
      expect(lockContent).toContain("installedAt:");
      expect(lockContent).toContain("updatedAt:");
    });
  });

  describe("canonical skill storage", () => {
    it("copies skill to .axm/skills/<name>/", async () => {
      const source = createSkillSource([{ name: "commit" }]);
      initializeAxm();

      const args: AddArgs = {
        ...defaultArgs,
        source,
        all: true,
        yes: true,
        agent: ["claude-code"],
      };

      await runHandler(handleAdd(args));

      const canonicalPath = path.join(tempDir, ".axm", "skills", "commit");
      expect(fs.existsSync(canonicalPath)).toBe(true);
      expect(fs.existsSync(path.join(canonicalPath, "SKILL.md"))).toBe(true);
    });

    it("preserves skill directory structure", async () => {
      // Create skill with subdirectories
      fs.mkdirSync(sourceDir, { recursive: true });
      const skillDir = path.join(sourceDir, "complex-skill");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Complex Skill");
      fs.mkdirSync(path.join(skillDir, "references"), { recursive: true });
      fs.writeFileSync(path.join(skillDir, "references", "commands.md"), "# Commands");

      initializeAxm();

      const args: AddArgs = {
        ...defaultArgs,
        source: sourceDir,
        all: true,
        yes: true,
        agent: ["claude-code"],
      };

      await runHandler(handleAdd(args));

      const canonicalPath = path.join(tempDir, ".axm", "skills", "complex-skill");
      expect(fs.existsSync(path.join(canonicalPath, "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(canonicalPath, "references", "commands.md"))).toBe(true);
    });
  });

  describe("initialization", () => {
    it("initializes .axm directory if not present", async () => {
      const source = createSkillSource([{ name: "commit" }]);
      // Don't call initializeAxm() - let handler create it

      const args: AddArgs = {
        ...defaultArgs,
        source,
        all: true,
        yes: true,
        agent: ["claude-code"],
      };

      const result = await runHandlerEither(handleAdd(args));

      expect(result._tag).toBe("Right");
      expect(fs.existsSync(path.join(tempDir, ".axm"))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, ".axm", "settings.json"))).toBe(true);
    });
  });

  describe("global flag", () => {
    it("uses ~/.axm for global installations", async () => {
      const source = createSkillSource([{ name: "commit" }]);

      // Backup and cleanup global settings
      const globalAxmDir = path.join(os.homedir(), ".axm");
      const globalSettingsPath = path.join(globalAxmDir, "settings.json");
      const existedBefore = fs.existsSync(globalSettingsPath);
      let backupSettings: string | undefined;
      let backupSkillsDir: string | undefined;
      const skillsDir = path.join(globalAxmDir, "skills", "commit");
      const skillsExistedBefore = fs.existsSync(skillsDir);

      if (existedBefore) {
        backupSettings = fs.readFileSync(globalSettingsPath, "utf-8");
      }
      if (skillsExistedBefore) {
        // Backup existing skill if present
        backupSkillsDir = fs.readFileSync(path.join(skillsDir, "SKILL.md"), "utf-8");
      }

      try {
        // Remove existing settings to test fresh init
        if (existedBefore) {
          fs.rmSync(globalSettingsPath);
        }
        if (skillsExistedBefore) {
          fs.rmSync(skillsDir, { recursive: true });
        }

        const args: AddArgs = {
          ...defaultArgs,
          source,
          global: true,
          all: true,
          yes: true,
          agent: ["claude-code"],
        };

        await runHandler(handleAdd(args));

        // Should create settings in home directory
        expect(fs.existsSync(globalSettingsPath)).toBe(true);

        // Skill should be in global location
        expect(fs.existsSync(path.join(globalAxmDir, "skills", "commit", "SKILL.md"))).toBe(true);

        // Should NOT be in project directory
        expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "commit"))).toBe(false);
      } finally {
        // Restore original state
        if (existedBefore && backupSettings) {
          fs.writeFileSync(globalSettingsPath, backupSettings);
        } else if (!existedBefore && fs.existsSync(globalSettingsPath)) {
          fs.rmSync(globalSettingsPath);
        }
        if (skillsExistedBefore && backupSkillsDir) {
          fs.mkdirSync(skillsDir, { recursive: true });
          fs.writeFileSync(path.join(skillsDir, "SKILL.md"), backupSkillsDir);
        } else if (!skillsExistedBefore && fs.existsSync(skillsDir)) {
          fs.rmSync(skillsDir, { recursive: true });
        }
      }
    });
  });

  describe("error scenarios", () => {
    it("returns AddError with descriptive message for parsing errors", async () => {
      initializeAxm();

      const args: AddArgs = {
        ...defaultArgs,
        source: "",
        yes: true,
        agent: ["claude-code"],
      };

      const result = await runHandlerEither(handleAdd(args));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("AddError");
        expect((result.left as AddError).message).toBeTruthy();
      }
    });

    it("handles discovery errors gracefully", async () => {
      initializeAxm();

      // Source that doesn't exist
      const args: AddArgs = {
        ...defaultArgs,
        source: "/nonexistent/path/to/skills",
        yes: true,
        agent: ["claude-code"],
      };

      const result = await runHandlerEither(handleAdd(args));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("AddError");
      }
    });
  });

  describe("error messages with recovery guidance", () => {
    it("invalid source error suggests valid source formats", async () => {
      initializeAxm();

      const args: AddArgs = {
        ...defaultArgs,
        source: "", // Empty source is invalid
        yes: true,
        agent: ["claude-code"],
      };

      const result = await runHandlerEither(handleAdd(args));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("AddError");
        const message = (result.left as AddError).message;
        expect(message).toContain("Invalid source");
        // Recovery guidance: valid formats
        expect(message).toContain("github:");
        expect(message).toContain("gitlab:");
        expect(message).toContain("local path");
      }
    });

    it("no skills found error suggests checking the source path", async () => {
      fs.mkdirSync(sourceDir, { recursive: true });
      initializeAxm();

      const args: AddArgs = {
        ...defaultArgs,
        source: sourceDir,
        yes: true,
        agent: ["claude-code"],
      };

      const result = await runHandlerEither(handleAdd(args));

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("AddError");
        const message = (result.left as AddError).message;
        expect(message).toContain("No skills found");
        expect(message).toContain(sourceDir);
        // Recovery guidance: check for SKILL.md files
        expect(message).toContain("SKILL.md");
      }
    });
  });

  describe("AddError", () => {
    it("is a tagged error with correct tag", () => {
      const error = new AddError({
        message: "Test error message",
      });

      expect(error._tag).toBe("AddError");
      expect(error.message).toBe("Test error message");
    });

    it("can include a cause", () => {
      const cause = new Error("Original error");
      const error = new AddError({
        message: "Wrapped error",
        cause,
      });

      expect(error.cause).toBe(cause);
    });
  });

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
      it("fails with AddError when stdin is not TTY and no --yes/--agent flag", async () => {
        isInteractiveMock.mockReturnValue(false);
        const source = createSkillSource([{ name: "commit" }]);
        initializeAxm();

        const args: AddArgs = {
          ...defaultArgs,
          source,
          // No --yes, no --agent, no --non-interactive
        };

        const result = await runHandlerEither(handleAdd(args));

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left._tag).toBe("AddError");
          expect((result.left as AddError).message).toContain("Cannot prompt for agent selection");
          expect((result.left as AddError).message).toContain("stdin is not a TTY");
          expect((result.left as AddError).message).toContain("--yes");
          expect((result.left as AddError).message).toContain("--all");
          expect((result.left as AddError).message).toContain("--non-interactive");
        }
      });

      it("succeeds when stdin is not TTY but --yes flag is set", async () => {
        isInteractiveMock.mockReturnValue(false);
        const source = createSkillSource([{ name: "commit" }]);
        initializeAxm();

        const args: AddArgs = {
          ...defaultArgs,
          source,
          yes: true,
          agent: ["claude-code"],
          all: true,
        };

        const result = await runHandlerEither(handleAdd(args));

        expect(result._tag).toBe("Right");
      });

      it("succeeds when stdin is not TTY but --non-interactive flag is set", async () => {
        isInteractiveMock.mockReturnValue(false);
        const source = createSkillSource([{ name: "commit" }]);
        initializeAxm();

        const args: AddArgs = {
          ...defaultArgs,
          source,
          nonInteractive: true,
          agent: ["claude-code"],
          all: true,
        };

        const result = await runHandlerEither(handleAdd(args));

        expect(result._tag).toBe("Right");
      });
    });

    describe("skill selection in non-interactive mode", () => {
      it("fails with AddError when stdin is not TTY and no --all/--skill flag", async () => {
        isInteractiveMock.mockReturnValue(false);
        const source = createSkillSource([{ name: "commit" }]);
        initializeAxm();

        const args: AddArgs = {
          ...defaultArgs,
          source,
          agent: ["claude-code"], // Explicit agent avoids agent selection prompt
          // No --all, no --skill
        };

        const result = await runHandlerEither(handleAdd(args));

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left._tag).toBe("AddError");
          expect((result.left as AddError).message).toContain("Cannot prompt for skill selection");
          expect((result.left as AddError).message).toContain("stdin is not a TTY");
        }
      });

      it("succeeds when stdin is not TTY but --all flag is set", async () => {
        isInteractiveMock.mockReturnValue(false);
        const source = createSkillSource([{ name: "commit" }]);
        initializeAxm();

        const args: AddArgs = {
          ...defaultArgs,
          source,
          agent: ["claude-code"],
          all: true,
          yes: true, // Skip confirmation prompt too
        };

        const result = await runHandlerEither(handleAdd(args));

        expect(result._tag).toBe("Right");
      });

      it("succeeds when stdin is not TTY but --skill flag is set", async () => {
        isInteractiveMock.mockReturnValue(false);
        const source = createSkillSource([{ name: "commit" }, { name: "review-pr" }]);
        initializeAxm();

        const args: AddArgs = {
          ...defaultArgs,
          source,
          agent: ["claude-code"],
          skill: ["commit"],
          yes: true, // Skip confirmation prompt too
        };

        const result = await runHandlerEither(handleAdd(args));

        expect(result._tag).toBe("Right");
        // Only specified skill should be installed
        expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "commit", "SKILL.md"))).toBe(
          true,
        );
        expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "review-pr"))).toBe(false);
      });
    });

    describe("confirmation in non-interactive mode", () => {
      it("fails with AddError when stdin is not TTY and confirmation needed", async () => {
        isInteractiveMock.mockReturnValue(false);
        const source = createSkillSource([{ name: "commit" }]);
        initializeAxm();

        const args: AddArgs = {
          ...defaultArgs,
          source,
          agent: ["claude-code"],
          all: true,
          // No --yes - would need confirmation prompt
        };

        const result = await runHandlerEither(handleAdd(args));

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left._tag).toBe("AddError");
          expect((result.left as AddError).message).toContain("Cannot prompt for confirmation");
          expect((result.left as AddError).message).toContain("stdin is not a TTY");
        }
      });
    });

    describe("output formatting", () => {
      it("uses plain text output when stdout is not TTY", async () => {
        // This test verifies the handler doesn't crash when fancy output is disabled
        isInteractiveMock.mockReturnValue(true);
        isFancyOutputMock.mockReturnValue(false);

        const source = createSkillSource([{ name: "commit" }]);
        initializeAxm();

        const args: AddArgs = {
          ...defaultArgs,
          source,
          agent: ["claude-code"],
          all: true,
          yes: true,
        };

        const result = await runHandlerEither(handleAdd(args));

        // Should complete successfully with plain text output
        expect(result._tag).toBe("Right");
      });

      it("handles both non-TTY stdin and stdout", async () => {
        isInteractiveMock.mockReturnValue(false);
        isFancyOutputMock.mockReturnValue(false);

        const source = createSkillSource([{ name: "commit" }]);
        initializeAxm();

        const args: AddArgs = {
          ...defaultArgs,
          source,
          agent: ["claude-code"],
          all: true,
          yes: true,
        };

        const result = await runHandlerEither(handleAdd(args));

        // Should complete successfully
        expect(result._tag).toBe("Right");
        expect(fs.existsSync(path.join(tempDir, ".axm", "skills", "commit", "SKILL.md"))).toBe(
          true,
        );
      });
    });
  });
});
