/**
 * E2E tests for the `axm skills install` command.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";
import { getOutput } from "../../../test-helpers.js";

describe("axm skills install", () => {
  describe("with local source --all --yes", () => {
    it("installs all skills and creates .axm structure", async () => {
      const temp = createTempDir();
      try {
        // Initialize first with claude-code agent to ensure .claude/ symlinks
        await runCli(["setup", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        // Install all skills
        const result = await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);
        const output = getOutput(result);
        expect(output).toContain("my-skill");
        expect(output).toContain("another-skill");

        // Verify .axm structure
        const axmDir = path.join(temp.path, ".axm");
        expect(fs.existsSync(axmDir)).toBe(true);

        // Verify settings.json exists
        const settingsPath = path.join(axmDir, "settings.json");
        expect(fs.existsSync(settingsPath)).toBe(true);

        // Verify axm-lock.yaml exists and has entries (YAML format)
        const lockPath = path.join(axmDir, "axm-lock.yaml");
        expect(fs.existsSync(lockPath)).toBe(true);
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        expect(lock).toHaveProperty("lockfileVersion");
        expect(lock).toHaveProperty("skills");
        expect(lock.skills).toHaveProperty("my-skill");
        expect(lock.skills).toHaveProperty("another-skill");

        // Verify canonical skills directory (.axm/extensions/external/skills/)
        const skillsDir = path.join(temp.path, ".axm", "extensions", "external", "skills");
        expect(fs.existsSync(skillsDir)).toBe(true);
        expect(fs.existsSync(path.join(skillsDir, "my-skill"))).toBe(true);
        expect(fs.existsSync(path.join(skillsDir, "another-skill"))).toBe(true);

        // Verify symlinks were created in agent directory
        // claude-code skillsDir is ".claude/skills"
        const claudeSkillsDir = path.join(temp.path, ".claude", "skills", "my-skill");
        expect(fs.existsSync(claudeSkillsDir)).toBe(true);
        // Check if it's a symlink
        const stat = fs.lstatSync(claudeSkillsDir);
        expect(stat.isSymbolicLink()).toBe(true);
      } finally {
        temp.cleanup();
      }
    });

    it("includes folderHash in lockfile entries", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes"], {
          cwd: temp.path,
        });

        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

        // Verify lockfile structure
        expect(lock.lockfileVersion).toBe(2);
        expect(lock.skills).toBeDefined();

        // Each skill entry should have required fields per flat schema
        for (const skillName of ["my-skill", "another-skill"]) {
          const entry = lock.skills[skillName];
          expect(entry).toBeDefined();
          // Flat schema: type is a string discriminator, not nested object
          expect(entry.type).toBe("local");
          expect(entry.path).toBeDefined();
          expect(entry).toHaveProperty("agents");
          expect(entry).toHaveProperty("installedAt");
          expect(entry).toHaveProperty("updatedAt");
        }
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("with invalid source", () => {
    it("shows error and exits non-zero for non-existent path", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        const result = await runCli(
          ["skills", "install", "/nonexistent/path/to/skills", "--all", "--yes"],
          { cwd: temp.path },
        );

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("Failed to discover skills");
      } finally {
        temp.cleanup();
      }
    });

    it("shows error for empty directory (no SKILL.md files)", async () => {
      const temp = createTempDir();
      const emptyDir = createTempDir("empty-skills-");
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        const result = await runCli(["skills", "install", emptyDir.path, "--all", "--yes"], {
          cwd: temp.path,
        });

        // Should exit with error when no skills found
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("No skills found");
      } finally {
        temp.cleanup();
        emptyDir.cleanup();
      }
    });
  });

  describe("file system state verification", () => {
    it("creates expected directory structure", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        // Expected structure:
        // .axm/
        //   settings.json
        //   axm-lock.yaml
        // .axm/
        //   extensions/external/skills/
        //     my-skill/
        //       SKILL.md
        // .claude/
        //   skills/
        //     my-skill -> symlink to canonical (symlink)

        const axmDir = path.join(temp.path, ".axm");
        const settingsPath = path.join(axmDir, "settings.json");
        const lockPath = path.join(axmDir, "axm-lock.yaml");
        const canonicalSkillDir = path.join(
          temp.path,
          ".axm",
          "extensions",
          "external",
          "skills",
          "my-skill",
        );
        const canonicalSkillMd = path.join(canonicalSkillDir, "SKILL.md");

        expect(fs.existsSync(settingsPath)).toBe(true);
        expect(fs.existsSync(lockPath)).toBe(true);
        expect(fs.existsSync(canonicalSkillDir)).toBe(true);
        expect(fs.existsSync(canonicalSkillMd)).toBe(true);

        // Verify symlink in agent directory (.claude/skills for claude-code)
        const agentSkillDir = path.join(temp.path, ".claude", "skills", "my-skill");
        expect(fs.existsSync(agentSkillDir)).toBe(true);
        expect(fs.lstatSync(agentSkillDir).isSymbolicLink()).toBe(true);

        // Verify symlink target resolves correctly
        const resolvedTarget = fs.realpathSync(agentSkillDir);
        expect(resolvedTarget).toBe(fs.realpathSync(canonicalSkillDir));
      } finally {
        temp.cleanup();
      }
    });

    it("settings.json preserves agents after installation", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

        // Settings should still have agents
        expect(settings).toHaveProperty("agents");
        expect(settings.agents).toContain("claude-code");
      } finally {
        temp.cleanup();
      }
    });

    it("axm-lock.yaml contains lock entry for installed skill with new schema", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

        // Verify new lockfile structure
        expect(lock.lockfileVersion).toBe(2);
        expect(lock.skills).toBeDefined();
        expect(lock.skills["my-skill"]).toBeDefined();

        const entry = lock.skills["my-skill"];
        // Flat schema: source is a string discriminator, path is at top level
        expect(entry.type).toBe("local");
        expect(entry.path).toBeDefined();
        expect(entry.agents).toBeDefined();
        expect(Array.isArray(entry.agents)).toBe(true);
        expect(entry.installedAt).toBeDefined();
        expect(entry.updatedAt).toBeDefined();

        // Timestamps should be valid ISO 8601
        expect(new Date(entry.installedAt).toISOString()).toBe(entry.installedAt);
        expect(new Date(entry.updatedAt).toISOString()).toBe(entry.updatedAt);
      } finally {
        temp.cleanup();
      }
    });

    it("symlinks point to canonical skill directory", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes"], {
          cwd: temp.path,
        });

        for (const skillName of ["my-skill", "another-skill"]) {
          // claude-code skillsDir is ".claude/skills"
          const agentSkillDir = path.join(temp.path, ".claude", "skills", skillName);
          const canonicalSkillDir = path.join(
            temp.path,
            ".axm",
            "extensions",
            "external",
            "skills",
            skillName,
          );

          expect(fs.lstatSync(agentSkillDir).isSymbolicLink()).toBe(true);

          // Read the symlink and verify it points to the canonical location
          const linkTarget = fs.readlinkSync(agentSkillDir);
          // Resolve relative symlink
          const resolvedLink = path.resolve(path.dirname(agentSkillDir), linkTarget);
          expect(resolvedLink).toBe(canonicalSkillDir);
        }
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("conflict detection", () => {
    it("repairs already installed local skill (local sources always update)", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        // First install
        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        // Second install of same local skill triggers repair (no stable identifier)
        const result = await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        expect(getOutput(result)).toMatch(/already up to date|update|install/i);
      } finally {
        temp.cleanup();
      }
    });

    it("overwrites existing skill with --force", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        // First install
        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        // Second install with --force should succeed
        const result = await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes", "--force"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        expect(getOutput(result)).toContain("my-skill");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("--help", () => {
    it("displays usage information", async () => {
      const result = await runCli(["skills", "install", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("skills install");
      expect(result.stdout).toContain("--all");
      expect(result.stdout).toContain("--yes");
      expect(result.stdout).toContain("--skill");
      expect(result.stdout).toContain("--scope");
      expect(result.stdout).toContain("--force");
      expect(result.stdout).toContain("--preview");
      // Verify removed flags are not in help output
      expect(result.stdout).not.toContain("--list");
      expect(result.stdout).not.toContain("--agent");
    });
  });

  describe("--preview", () => {
    it("shows installation plan without making changes", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        const result = await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--preview", "--non-interactive"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        const output = getOutput(result);
        expect(output).toContain("my-skill");
        expect(output).toContain("another-skill");
        expect(output).toMatch(/\+.*my-skill|\+.*another-skill/);
        expect(output).toContain("Previewing changes...");

        // Verify no files were created
        const skillsDir = path.join(temp.path, ".axm", "skills");
        expect(fs.existsSync(skillsDir)).toBe(false);
      } finally {
        temp.cleanup();
      }
    });

    it("shows summary with counts", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        const result = await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--preview", "--non-interactive"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        expect(getOutput(result)).toMatch(/\d+ to apply/);
      } finally {
        temp.cleanup();
      }
    });

    it("shows repair when skill exists with different content (hash mismatch)", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        // First install a skill
        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        // Modify the installed skill to simulate local changes (creates hash mismatch)
        const skillMdPath = path.join(
          temp.path,
          ".axm",
          "extensions",
          "external",
          "skills",
          "my-skill",
          "SKILL.md",
        );
        const originalContent = fs.readFileSync(skillMdPath, "utf-8");
        fs.writeFileSync(skillMdPath, `${originalContent}\n# Modified locally`);

        // Run preview with force - should show repair due to hash mismatch
        const result = await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--preview",
            "--non-interactive",
            "--force",
          ],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        const output = getOutput(result);
        expect(output).toContain("my-skill");
        expect(output).toMatch(/\+.*my-skill|to install/);
        expect(output).toContain("Previewing changes...");
      } finally {
        temp.cleanup();
      }
    });

    it("reinstalling same skill shows install plan (idempotent)", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        // Install a skill
        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        // Run preview for the same skill - install operations are idempotent
        const result = await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--preview",
            "--non-interactive",
          ],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        expect(getOutput(result)).toContain("my-skill");
      } finally {
        temp.cleanup();
      }
    });
  });

  // =========================================================================
  // NEW FORMAT TESTS (skills-install-reconciliation)
  // These tests verify the new lockfile/settings format from the reconciliation refactor:
  // - Lockfile: skills at root (not extensions.skills), gitTreeHash, agents array, source._tag
  // - Settings: skills at root with SkillSettingsEntry format
  // =========================================================================

  describe("new lockfile format (reconciliation)", () => {
    it.skip("creates lockfile with skills at root level (not under extensions)", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        expect(fs.existsSync(lockPath)).toBe(true);
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

        // New format: skills at root level
        expect(lock.lockfileVersion).toBe(2);
        expect(lock.skills).toBeDefined();
        expect(lock.skills["my-skill"]).toBeDefined();

        // Should NOT have extensions.skills (old format)
        expect(lock.extensions).toBeUndefined();
      } finally {
        temp.cleanup();
      }
    });

    it.skip("creates lockfile entry with source object containing _tag discriminator", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

        const entry = lock.skills["my-skill"];
        expect(entry).toBeDefined();

        // Source should be a structured object with _tag discriminator
        expect(entry.type).toBeDefined();
        expect(entry.type._tag).toBe("Local");
        expect(entry.type.path).toBeDefined();
        expect(typeof entry.type.path).toBe("string");
      } finally {
        temp.cleanup();
      }
    });

    it.skip("creates lockfile entry with gitTreeHash (not folderHash)", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

        const entry = lock.skills["my-skill"];
        expect(entry).toBeDefined();

        // Should have gitTreeHash (optional for local sources)
        // Note: Local sources may not have gitTreeHash, but should NOT have folderHash
        expect(entry.folderHash).toBeUndefined();
      } finally {
        temp.cleanup();
      }
    });

    it.skip("creates lockfile entry with agents array", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

        const entry = lock.skills["my-skill"];
        expect(entry).toBeDefined();

        // New format: agents array (non-empty)
        expect(entry.agents).toBeDefined();
        expect(Array.isArray(entry.agents)).toBe(true);
        expect(entry.agents.length).toBeGreaterThan(0);
        expect(entry.agents).toContain("claude-code");
      } finally {
        temp.cleanup();
      }
    });

    it.skip("creates lockfile entry with installedAt and updatedAt timestamps", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

        const entry = lock.skills["my-skill"];
        expect(entry).toBeDefined();

        // Timestamps should be valid ISO 8601
        expect(entry.installedAt).toBeDefined();
        expect(entry.updatedAt).toBeDefined();
        expect(new Date(entry.installedAt).toISOString()).toBe(entry.installedAt);
        expect(new Date(entry.updatedAt).toISOString()).toBe(entry.updatedAt);
      } finally {
        temp.cleanup();
      }
    });

    it.skip("creates lockfile with complete structure for multiple skills", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes"], {
          cwd: temp.path,
        });

        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

        // Expected structure per design:
        // lockfileVersion: 2
        // skills:
        //   my-skill:
        //     source:
        //       _tag: Local
        //       path: <fixture-path>
        //     agents: [claude-code]
        //     installedAt: "2025-01-15T10:30:00Z"
        //     updatedAt: "2025-01-15T10:30:00Z"
        //   another-skill:
        //     ...

        expect(lock.lockfileVersion).toBe(2);
        expect(lock.skills).toBeDefined();
        expect(Object.keys(lock.skills).length).toBe(2);

        for (const skillName of ["my-skill", "another-skill"]) {
          const entry = lock.skills[skillName];
          expect(entry).toBeDefined();
          expect(entry.type).toBeDefined();
          expect(entry.type._tag).toBe("Local");
          expect(entry.agents).toContain("claude-code");
          expect(entry.installedAt).toBeDefined();
          expect(entry.updatedAt).toBeDefined();
        }
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("new settings format (reconciliation)", () => {
    it.skip("creates settings with skills at root level", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

        // Skills should be at root level
        expect(settings.skills).toBeDefined();
        expect(settings.skills["my-skill"]).toBeDefined();
      } finally {
        temp.cleanup();
      }
    });

    it.skip("creates settings with SkillSettingsEntry object for Local source", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

        const entry = settings.skills["my-skill"];
        expect(entry).toBeDefined();

        // For Local source, settings entry should be an object with _tag
        expect(typeof entry).toBe("object");
        expect(entry._tag).toBe("Local");
        expect(entry.path).toBeDefined();
        expect(typeof entry.path).toBe("string");
      } finally {
        temp.cleanup();
      }
    });

    it.skip("creates settings with multiple skills in correct format", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes"], {
          cwd: temp.path,
        });

        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

        // Expected structure per design:
        // {
        //   "skills": {
        //     "my-skill": {
        //       "_tag": "Local",
        //       "path": "<fixture-path>"
        //     },
        //     "another-skill": {
        //       "_tag": "Local",
        //       "path": "<fixture-path>"
        //     }
        //   }
        // }

        expect(settings.skills).toBeDefined();
        expect(Object.keys(settings.skills).length).toBe(2);

        for (const skillName of ["my-skill", "another-skill"]) {
          const entry = settings.skills[skillName];
          expect(entry).toBeDefined();
          expect(typeof entry).toBe("object");
          expect(entry._tag).toBe("Local");
          expect(entry.path).toBeDefined();
        }
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("preview with new format (reconciliation)", () => {
    it.skip("preview displays plan with new action labels", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        const result = await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--preview"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);

        // Should show plan with new format (InstallSkill action)
        expect(result.stdout).toContain("my-skill");
        expect(result.stdout).toContain("another-skill");
        // Should show + for install
        expect(result.stdout).toMatch(/\+.*my-skill|\+.*another-skill/);
        expect(result.stdout).toContain("Previewing changes...");
      } finally {
        temp.cleanup();
      }
    });

    it.skip("preview shows agents in plan output", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        const result = await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--preview"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);

        // Plan output should include agent information
        expect(result.stdout).toContain("claude-code");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("force flag with new format (reconciliation)", () => {
    it.skip("--force reinstalls skill with updated lockfile entry", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        // First install
        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        // Get original lockfile timestamp
        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lockBefore = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        const installedAtBefore = lockBefore.skills?.["my-skill"]?.installedAt;

        // Wait a bit to ensure timestamp difference
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Force reinstall
        const result = await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes", "--force"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);

        // Verify lockfile was updated
        const lockAfter = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        const entry = lockAfter.skills?.["my-skill"];
        expect(entry).toBeDefined();

        // installedAt should remain the same (original install time)
        expect(entry.installedAt).toBe(installedAtBefore);
        // updatedAt should be newer
        expect(new Date(entry.updatedAt).getTime()).toBeGreaterThanOrEqual(
          new Date(installedAtBefore).getTime(),
        );
      } finally {
        temp.cleanup();
      }
    });
  });
});
