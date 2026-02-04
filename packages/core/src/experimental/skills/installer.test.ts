/**
 * Unit tests for installer module.
 *
 * Tests skill installation to agent directories using symlinks with copy fallback.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { FileSystem, Error as PlatformError } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach } from "vitest";
import {
  copySkillToCanonical,
  copyToAgent,
  createAgentSymlink,
  InstallError,
  installSkill,
  installSkillToAgents,
  removeSkillFromAgents,
} from "./installer.js";
import type { AgentConfig, Skill } from "./types.js";

describe("installer", () => {
  let tempDir: string;
  let axmDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "installer-test-"));
    axmDir = path.join(tempDir, ".axm");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const withFileSystem = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
    effect.pipe(Effect.provide(NodeFileSystem.layer));

  /**
   * Helper to create a skill directory with SKILL.md
   */
  const createSkillSource = (
    skillName: string,
    additionalFiles?: Record<string, string>,
  ): { skill: Skill; sourcePath: string } => {
    const sourcePath = path.join(tempDir, "source", skillName);
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.writeFileSync(path.join(sourcePath, "SKILL.md"), `# ${skillName}\n\nA test skill.`);

    if (additionalFiles) {
      for (const [filename, content] of Object.entries(additionalFiles)) {
        const filePath = path.join(sourcePath, filename);
        const dir = path.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, content);
      }
    }

    return {
      skill: {
        name: skillName,
        path: path.join(sourcePath, "SKILL.md"),
      },
      sourcePath,
    };
  };

  /**
   * Helper to create an agent config
   */
  const createAgent = (id: string): AgentConfig => {
    const agentDir = path.join(tempDir, "agents", id);
    fs.mkdirSync(agentDir, { recursive: true });
    return {
      id,
      name: `Test ${id}`,
      detectPath: agentDir,
    };
  };

  describe("copySkillToCanonical", () => {
    it.effect("copies skill to .axm/skills/<name>/", () =>
      withFileSystem(
        Effect.gen(function* () {
          const { skill } = createSkillSource("commit");
          const canonicalPath = yield* copySkillToCanonical(skill, axmDir);

          expect(canonicalPath).toBe(path.join(axmDir, "skills", "commit"));
          expect(fs.existsSync(path.join(canonicalPath, "SKILL.md"))).toBe(true);
        }),
      ),
    );

    it.effect("creates .axm/skills directory if it does not exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          const { skill } = createSkillSource("commit");
          yield* copySkillToCanonical(skill, axmDir);

          expect(fs.existsSync(path.join(axmDir, "skills"))).toBe(true);
        }),
      ),
    );

    it.effect("copies all files from skill directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          const { skill } = createSkillSource("commit", {
            "README.md": "# Readme",
            "references/commands.md": "# Commands",
            "assets/icon.svg": "<svg></svg>",
          });

          const canonicalPath = yield* copySkillToCanonical(skill, axmDir);

          expect(fs.existsSync(path.join(canonicalPath, "SKILL.md"))).toBe(true);
          expect(fs.existsSync(path.join(canonicalPath, "README.md"))).toBe(true);
          expect(fs.existsSync(path.join(canonicalPath, "references", "commands.md"))).toBe(true);
          expect(fs.existsSync(path.join(canonicalPath, "assets", "icon.svg"))).toBe(true);
        }),
      ),
    );

    it.effect("overwrites existing skill if present", () =>
      withFileSystem(
        Effect.gen(function* () {
          const { skill } = createSkillSource("commit");

          // First copy
          const canonicalPath = yield* copySkillToCanonical(skill, axmDir);
          fs.writeFileSync(path.join(canonicalPath, "extra.md"), "Extra file");

          // Modify source and copy again
          fs.writeFileSync(skill.path, "# Updated Commit\n\nUpdated content.");
          yield* copySkillToCanonical(skill, axmDir);

          const content = fs.readFileSync(path.join(canonicalPath, "SKILL.md"), "utf-8");
          expect(content).toContain("Updated content");
        }),
      ),
    );

    it.effect("fails with InstallError for non-existent skill path", () =>
      withFileSystem(
        Effect.gen(function* () {
          const skill: Skill = {
            name: "nonexistent",
            path: path.join(tempDir, "does-not-exist", "SKILL.md"),
          };

          const error = yield* copySkillToCanonical(skill, axmDir).pipe(Effect.flip);

          expect(error).toBeInstanceOf(InstallError);
          expect(error.operation).toBe("copy-to-canonical");
        }),
      ),
    );
  });

  describe("createAgentSymlink", () => {
    it.effect("creates symlink in agent skills directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          const { skill } = createSkillSource("commit");
          const canonicalPath = yield* copySkillToCanonical(skill, axmDir);
          const agent = createAgent("claude-code");

          const symlinkPath = yield* createAgentSymlink(canonicalPath, agent, skill.name);

          const expectedPath = path.join(agent.detectPath, "skills", "commit");
          expect(symlinkPath).toBe(expectedPath);
          expect(fs.lstatSync(symlinkPath).isSymbolicLink()).toBe(true);
        }),
      ),
    );

    it.effect("uses relative path for symlink target", () =>
      withFileSystem(
        Effect.gen(function* () {
          const { skill } = createSkillSource("commit");
          const canonicalPath = yield* copySkillToCanonical(skill, axmDir);
          const agent = createAgent("claude-code");

          const symlinkPath = yield* createAgentSymlink(canonicalPath, agent, skill.name);

          const target = fs.readlinkSync(symlinkPath);
          // Target should be relative, not absolute
          expect(target.startsWith("/")).toBe(false);
          expect(target.startsWith("C:")).toBe(false);
        }),
      ),
    );

    it.effect("creates agent skills directory if it does not exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          const { skill } = createSkillSource("commit");
          const canonicalPath = yield* copySkillToCanonical(skill, axmDir);
          const agent = createAgent("new-agent");

          yield* createAgentSymlink(canonicalPath, agent, skill.name);

          expect(fs.existsSync(path.join(agent.detectPath, "skills"))).toBe(true);
        }),
      ),
    );

    it.effect("uses custom skillsDir if provided", () =>
      withFileSystem(
        Effect.gen(function* () {
          const { skill } = createSkillSource("commit");
          const canonicalPath = yield* copySkillToCanonical(skill, axmDir);
          const customSkillsDir = path.join(tempDir, "custom-skills");
          const agent: AgentConfig = {
            id: "custom",
            name: "Custom Agent",
            detectPath: path.join(tempDir, "agents", "custom"),
            skillsDir: customSkillsDir,
          };

          const symlinkPath = yield* createAgentSymlink(canonicalPath, agent, skill.name);

          expect(symlinkPath).toBe(path.join(customSkillsDir, "commit"));
          expect(fs.existsSync(symlinkPath)).toBe(true);
        }),
      ),
    );

    it.effect("replaces existing symlink", () =>
      withFileSystem(
        Effect.gen(function* () {
          const { skill } = createSkillSource("commit");
          const canonicalPath = yield* copySkillToCanonical(skill, axmDir);
          const agent = createAgent("claude-code");

          // Create first symlink
          yield* createAgentSymlink(canonicalPath, agent, skill.name);

          // Create a new canonical location
          const { skill: skill2 } = createSkillSource("commit-v2");
          const canonicalPath2 = yield* copySkillToCanonical(skill2, axmDir);

          // Create second symlink (should replace first)
          const symlinkPath = yield* createAgentSymlink(canonicalPath2, agent, skill.name);

          // Verify it points to new location
          expect(fs.lstatSync(symlinkPath).isSymbolicLink()).toBe(true);
        }),
      ),
    );

    it.effect("replaces existing directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          const { skill } = createSkillSource("commit");
          const canonicalPath = yield* copySkillToCanonical(skill, axmDir);
          const agent = createAgent("claude-code");

          // Create a directory at the target path
          const targetPath = path.join(agent.detectPath, "skills", "commit");
          fs.mkdirSync(targetPath, { recursive: true });
          fs.writeFileSync(path.join(targetPath, "old-file.md"), "Old content");

          // Create symlink (should replace directory)
          const symlinkPath = yield* createAgentSymlink(canonicalPath, agent, skill.name);

          expect(fs.lstatSync(symlinkPath).isSymbolicLink()).toBe(true);
        }),
      ),
    );
  });

  describe("copyToAgent", () => {
    it.effect("copies skill to agent skills directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          const { skill } = createSkillSource("commit");
          const canonicalPath = yield* copySkillToCanonical(skill, axmDir);
          const agent = createAgent("claude-code");

          const destPath = yield* copyToAgent(canonicalPath, agent, skill.name);

          const expectedPath = path.join(agent.detectPath, "skills", "commit");
          expect(destPath).toBe(expectedPath);
          expect(fs.existsSync(path.join(destPath, "SKILL.md"))).toBe(true);
        }),
      ),
    );

    it.effect("copies all files from canonical location", () =>
      withFileSystem(
        Effect.gen(function* () {
          const { skill } = createSkillSource("commit", {
            "README.md": "# Readme",
            "docs/guide.md": "# Guide",
          });
          const canonicalPath = yield* copySkillToCanonical(skill, axmDir);
          const agent = createAgent("claude-code");

          const destPath = yield* copyToAgent(canonicalPath, agent, skill.name);

          expect(fs.existsSync(path.join(destPath, "SKILL.md"))).toBe(true);
          expect(fs.existsSync(path.join(destPath, "README.md"))).toBe(true);
          expect(fs.existsSync(path.join(destPath, "docs", "guide.md"))).toBe(true);
        }),
      ),
    );

    it.effect("creates agent skills directory if it does not exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          const { skill } = createSkillSource("commit");
          const canonicalPath = yield* copySkillToCanonical(skill, axmDir);
          const agent = createAgent("new-agent");

          yield* copyToAgent(canonicalPath, agent, skill.name);

          expect(fs.existsSync(path.join(agent.detectPath, "skills"))).toBe(true);
        }),
      ),
    );

    it.effect("replaces existing directory", () =>
      withFileSystem(
        Effect.gen(function* () {
          const { skill } = createSkillSource("commit");
          const canonicalPath = yield* copySkillToCanonical(skill, axmDir);
          const agent = createAgent("claude-code");

          // Create existing directory with old content
          const targetPath = path.join(agent.detectPath, "skills", "commit");
          fs.mkdirSync(targetPath, { recursive: true });
          fs.writeFileSync(path.join(targetPath, "old-file.md"), "Old content");

          // Copy (should replace)
          yield* copyToAgent(canonicalPath, agent, skill.name);

          expect(fs.existsSync(path.join(targetPath, "SKILL.md"))).toBe(true);
          expect(fs.existsSync(path.join(targetPath, "old-file.md"))).toBe(false);
        }),
      ),
    );
  });

  describe("installSkill", () => {
    it.effect("copies to canonical and creates symlink", () =>
      withFileSystem(
        Effect.gen(function* () {
          const { skill } = createSkillSource("commit");
          const agent = createAgent("claude-code");

          const result = yield* installSkill(skill, agent, axmDir);

          expect(result.skillName).toBe("commit");
          expect(result.method).toBe("symlink");
          expect(result.canonicalPath).toBe(path.join(axmDir, "skills", "commit"));
          expect(fs.existsSync(result.canonicalPath)).toBe(true);
          expect(fs.lstatSync(result.agentPath).isSymbolicLink()).toBe(true);
        }),
      ),
    );

    it.effect("returns correct InstallResult structure", () =>
      withFileSystem(
        Effect.gen(function* () {
          const { skill } = createSkillSource("review-pr");
          const agent = createAgent("cursor");

          const result = yield* installSkill(skill, agent, axmDir);

          expect(result).toEqual({
            skillName: "review-pr",
            method: "symlink",
            canonicalPath: path.join(axmDir, "skills", "review-pr"),
            agentPath: path.join(agent.detectPath, "skills", "review-pr"),
          });
        }),
      ),
    );

    it.effect("handles complex skill with multiple files", () =>
      withFileSystem(
        Effect.gen(function* () {
          const { skill } = createSkillSource("complex-skill", {
            "README.md": "# Complex Skill",
            "config.json": '{"version": 1}',
            "templates/default.md": "# Template",
            "assets/logo.svg": "<svg></svg>",
          });
          const agent = createAgent("claude-code");

          const result = yield* installSkill(skill, agent, axmDir);

          expect(result.method).toBe("symlink");

          // Verify canonical location has all files
          expect(fs.existsSync(path.join(result.canonicalPath, "SKILL.md"))).toBe(true);
          expect(fs.existsSync(path.join(result.canonicalPath, "README.md"))).toBe(true);
          expect(fs.existsSync(path.join(result.canonicalPath, "config.json"))).toBe(true);
          expect(fs.existsSync(path.join(result.canonicalPath, "templates", "default.md"))).toBe(
            true,
          );
          expect(fs.existsSync(path.join(result.canonicalPath, "assets", "logo.svg"))).toBe(true);

          // Verify symlink resolves to same files
          expect(fs.existsSync(path.join(result.agentPath, "SKILL.md"))).toBe(true);
        }),
      ),
    );

    it.effect("falls back to copy when symlink creation fails", () =>
      Effect.gen(function* () {
        const { skill } = createSkillSource("commit-fallback");
        const agent = createAgent("fallback-agent");
        const agentSkillsDir = path.join(agent.detectPath, "skills");
        const targetPath = path.join(agentSkillsDir, "commit-fallback");

        // Create a FileSystem layer that fails on symlink but delegates all other operations
        // to the real NodeFileSystem
        const failingSymlinkLayer = Layer.effect(
          FileSystem.FileSystem,
          Effect.gen(function* () {
            const realFs = yield* Effect.provide(FileSystem.FileSystem, NodeFileSystem.layer);
            return {
              ...realFs,
              symlink: () =>
                Effect.fail(
                  new PlatformError.SystemError({
                    module: "FileSystem",
                    method: "symlink",
                    pathOrDescriptor: "test",
                    reason: "PermissionDenied",
                  }),
                ),
            } as FileSystem.FileSystem;
          }),
        );

        const result = yield* installSkill(skill, agent, axmDir).pipe(
          Effect.provide(failingSymlinkLayer),
        );

        // Should fall back to copy method
        expect(result.skillName).toBe("commit-fallback");
        expect(result.method).toBe("copy");
        expect(result.canonicalPath).toBe(path.join(axmDir, "skills", "commit-fallback"));
        expect(result.agentPath).toBe(targetPath);

        // Verify the skill files are copied (not symlinked)
        expect(fs.existsSync(path.join(result.agentPath, "SKILL.md"))).toBe(true);
        expect(fs.lstatSync(result.agentPath).isSymbolicLink()).toBe(false);
        expect(fs.lstatSync(result.agentPath).isDirectory()).toBe(true);
      }),
    );
  });

  describe("installSkillToAgents", () => {
    it.effect("installs to multiple agents", () =>
      withFileSystem(
        Effect.gen(function* () {
          const { skill } = createSkillSource("commit");
          const agents = [createAgent("claude-code"), createAgent("cursor"), createAgent("codex")];

          const results = yield* installSkillToAgents(skill, agents, axmDir);

          expect(results).toHaveLength(3);
          for (const result of results) {
            expect(result.skillName).toBe("commit");
            expect(result.method).toBe("symlink");
            expect(fs.existsSync(result.agentPath)).toBe(true);
          }
        }),
      ),
    );

    it.effect("copies to canonical only once", () =>
      withFileSystem(
        Effect.gen(function* () {
          const { skill } = createSkillSource("commit");
          const agents = [createAgent("agent1"), createAgent("agent2")];

          const results = yield* installSkillToAgents(skill, agents, axmDir);

          // All results should share the same canonical path
          const canonicalPaths = new Set(results.map((r) => r.canonicalPath));
          expect(canonicalPaths.size).toBe(1);
        }),
      ),
    );

    it.effect("handles empty agents array", () =>
      withFileSystem(
        Effect.gen(function* () {
          const { skill } = createSkillSource("commit");

          const results = yield* installSkillToAgents(skill, [], axmDir);

          expect(results).toHaveLength(0);
          // Canonical copy still happens
          expect(fs.existsSync(path.join(axmDir, "skills", "commit", "SKILL.md"))).toBe(true);
        }),
      ),
    );

    it.live("runs installations concurrently", () =>
      withFileSystem(
        Effect.gen(function* () {
          const { skill } = createSkillSource("commit");
          const agents = Array.from({ length: 10 }, (_, i) => createAgent(`agent-${i}`));

          const startTime = Date.now();
          const results = yield* installSkillToAgents(skill, agents, axmDir);
          const elapsed = Date.now() - startTime;

          expect(results).toHaveLength(10);
          // Should complete quickly due to concurrency
          expect(elapsed).toBeLessThan(5000);
        }),
      ),
    );
  });

  describe("InstallError", () => {
    it("is a tagged error with correct tag", () => {
      const error = new InstallError({
        operation: "copy-to-canonical",
        message: "Test error",
        path: "/test/path",
        retryable: false,
      });

      expect(error._tag).toBe("InstallError");
      expect(error.operation).toBe("copy-to-canonical");
      expect(error.message).toBe("Test error");
      expect(error.path).toBe("/test/path");
    });

    it("can include a cause", () => {
      const cause = new Error("Original error");
      const error = new InstallError({
        operation: "create-symlink",
        message: "Failed to create symlink",
        cause,
        retryable: false,
      });

      expect(error.cause).toBe(cause);
    });

    it("supports all operation types", () => {
      const operations: Array<InstallError["operation"]> = [
        "copy-to-canonical",
        "create-symlink",
        "copy-fallback",
        "read-directory",
        "remove",
      ];

      for (const operation of operations) {
        const error = new InstallError({
          operation,
          message: `Error during ${operation}`,
          retryable: false,
        });
        expect(error.operation).toBe(operation);
      }
    });
  });

  describe("removeSkillFromAgents", () => {
    it.effect("removes skill symlink from a single agent", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Setup: install skill first
          const { skill } = createSkillSource("commit");
          const agent = createAgent("claude-code");
          yield* installSkillToAgents(skill, [agent], axmDir);

          // Verify skill is installed
          const agentSkillPath = path.join(agent.detectPath, "skills", "commit");
          expect(fs.existsSync(agentSkillPath)).toBe(true);

          // Act: remove skill from agent
          yield* removeSkillFromAgents("commit", [agent], axmDir);

          // Assert: symlink is removed
          expect(fs.existsSync(agentSkillPath)).toBe(false);
        }),
      ),
    );

    it.effect("removes skill from multiple agents", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Setup: install skill to multiple agents
          const { skill } = createSkillSource("review-pr");
          const agents = [createAgent("claude-code"), createAgent("cursor"), createAgent("codex")];
          yield* installSkillToAgents(skill, agents, axmDir);

          // Verify all are installed
          for (const agent of agents) {
            const agentSkillPath = path.join(agent.detectPath, "skills", "review-pr");
            expect(fs.existsSync(agentSkillPath)).toBe(true);
          }

          // Act: remove skill from all agents
          yield* removeSkillFromAgents("review-pr", agents, axmDir);

          // Assert: all symlinks are removed
          for (const agent of agents) {
            const agentSkillPath = path.join(agent.detectPath, "skills", "review-pr");
            expect(fs.existsSync(agentSkillPath)).toBe(false);
          }
        }),
      ),
    );

    it.effect("deletes canonical copy from .axm/skills/<name>/", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Setup: install skill
          const { skill } = createSkillSource("commit");
          const agent = createAgent("claude-code");
          yield* installSkillToAgents(skill, [agent], axmDir);

          // Verify canonical exists
          const canonicalPath = path.join(axmDir, "skills", "commit");
          expect(fs.existsSync(canonicalPath)).toBe(true);
          expect(fs.existsSync(path.join(canonicalPath, "SKILL.md"))).toBe(true);

          // Act: remove skill
          yield* removeSkillFromAgents("commit", [agent], axmDir);

          // Assert: canonical is removed
          expect(fs.existsSync(canonicalPath)).toBe(false);
        }),
      ),
    );

    it.effect("handles copied skill (non-symlink) removal", () =>
      Effect.gen(function* () {
        const { skill } = createSkillSource("commit-copy");
        const agent = createAgent("copy-agent");
        const agentSkillsDir = path.join(agent.detectPath, "skills");
        const targetPath = path.join(agentSkillsDir, "commit-copy");

        // Create a FileSystem layer that fails on symlink to force copy fallback
        const failingSymlinkLayer = Layer.effect(
          FileSystem.FileSystem,
          Effect.gen(function* () {
            const realFs = yield* Effect.provide(FileSystem.FileSystem, NodeFileSystem.layer);
            return {
              ...realFs,
              symlink: () =>
                Effect.fail(
                  new PlatformError.SystemError({
                    module: "FileSystem",
                    method: "symlink",
                    pathOrDescriptor: "test",
                    reason: "PermissionDenied",
                  }),
                ),
            } as FileSystem.FileSystem;
          }),
        );

        // Install with copy fallback
        yield* installSkillToAgents(skill, [agent], axmDir).pipe(
          Effect.provide(failingSymlinkLayer),
        );

        // Verify it's a copy, not a symlink
        expect(fs.existsSync(targetPath)).toBe(true);
        expect(fs.lstatSync(targetPath).isDirectory()).toBe(true);
        expect(fs.lstatSync(targetPath).isSymbolicLink()).toBe(false);

        // Act: remove skill (uses real filesystem)
        yield* removeSkillFromAgents("commit-copy", [agent], axmDir).pipe(
          Effect.provide(NodeFileSystem.layer),
        );

        // Assert: copied directory is removed
        expect(fs.existsSync(targetPath)).toBe(false);
      }),
    );

    it.effect("fails with InstallError when skill not found in canonical location", () =>
      withFileSystem(
        Effect.gen(function* () {
          const agent = createAgent("claude-code");

          const error = yield* removeSkillFromAgents("nonexistent-skill", [agent], axmDir).pipe(
            Effect.flip,
          );

          expect(error).toBeInstanceOf(InstallError);
          expect(error.operation).toBe("remove");
          expect(error.message).toContain("nonexistent-skill");
        }),
      ),
    );

    it.effect("handles empty agents array (only removes canonical)", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Setup: install skill to an agent first
          const { skill } = createSkillSource("orphan-skill");
          const agent = createAgent("temp-agent");
          yield* installSkillToAgents(skill, [agent], axmDir);

          // Verify canonical exists
          const canonicalPath = path.join(axmDir, "skills", "orphan-skill");
          expect(fs.existsSync(canonicalPath)).toBe(true);

          // Act: remove with empty agents (simulates all agents already removed)
          yield* removeSkillFromAgents("orphan-skill", [], axmDir);

          // Assert: canonical is still removed
          expect(fs.existsSync(canonicalPath)).toBe(false);
        }),
      ),
    );

    it.effect("handles agent skills directory that does not exist", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Setup: install skill
          const { skill } = createSkillSource("commit");
          const agent = createAgent("claude-code");
          yield* installSkillToAgents(skill, [agent], axmDir);

          // Manually delete agent's skills directory to simulate missing state
          const agentSkillsDir = path.join(agent.detectPath, "skills");
          fs.rmSync(agentSkillsDir, { recursive: true, force: true });

          // Act: remove skill (should not fail even if agent path doesn't exist)
          yield* removeSkillFromAgents("commit", [agent], axmDir);

          // Assert: canonical is removed
          const canonicalPath = path.join(axmDir, "skills", "commit");
          expect(fs.existsSync(canonicalPath)).toBe(false);
        }),
      ),
    );

    it.effect("uses custom skillsDir if provided", () =>
      withFileSystem(
        Effect.gen(function* () {
          // Setup: install skill with custom skillsDir
          const { skill } = createSkillSource("custom-skill");
          const customSkillsDir = path.join(tempDir, "custom-skills");
          const agent: AgentConfig = {
            id: "custom",
            name: "Custom Agent",
            detectPath: path.join(tempDir, "agents", "custom"),
            skillsDir: customSkillsDir,
          };
          yield* installSkillToAgents(skill, [agent], axmDir);

          // Verify skill is in custom location
          const skillPath = path.join(customSkillsDir, "custom-skill");
          expect(fs.existsSync(skillPath)).toBe(true);

          // Act: remove skill
          yield* removeSkillFromAgents("custom-skill", [agent], axmDir);

          // Assert: skill is removed from custom location
          expect(fs.existsSync(skillPath)).toBe(false);
        }),
      ),
    );
  });
});
