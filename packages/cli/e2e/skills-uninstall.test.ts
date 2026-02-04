/**
 * E2E tests for the `axm skills uninstall` command.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "./utils.js";

describe("axm skills uninstall", () => {
  describe("basic uninstall flow", () => {
    it("uninstalls a skill from all agents", async () => {
      const temp = createTempDir();
      try {
        // Initialize workspace
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        // Install a skill first
        await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--yes",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        // Verify skill is installed
        const canonicalSkillDir = path.join(temp.path, ".axm", "skills", "my-skill");
        expect(fs.existsSync(canonicalSkillDir)).toBe(true);

        // Uninstall the skill
        const result = await runCli(["skills", "uninstall", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);

        // Verify canonical copy is removed
        expect(fs.existsSync(canonicalSkillDir)).toBe(false);

        // Verify symlink in agent directory is removed
        const agentSkillDir = path.join(temp.path, ".claude", "commands", "my-skill");
        expect(fs.existsSync(agentSkillDir)).toBe(false);

        // Verify skill is removed from lockfile
        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        expect(lock.skills?.["my-skill"]).toBeUndefined();

        // Verify skill is removed from settings
        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills?.["my-skill"]).toBeUndefined();
      } finally {
        temp.cleanup();
      }
    });

    it("removes symlink from agent directory", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--yes",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        // Verify symlink exists before uninstall
        const agentSkillDir = path.join(temp.path, ".claude", "commands", "my-skill");
        expect(fs.existsSync(agentSkillDir)).toBe(true);
        expect(fs.lstatSync(agentSkillDir).isSymbolicLink()).toBe(true);

        // Uninstall
        await runCli(["skills", "uninstall", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        // Verify symlink is removed
        expect(fs.existsSync(agentSkillDir)).toBe(false);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("skill not found error", () => {
    it("shows error when skill is not installed", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(["skills", "uninstall", "unknown-skill", "--yes"], {
          cwd: temp.path,
        });

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("Skill 'unknown-skill' is not installed");
      } finally {
        temp.cleanup();
      }
    });

    it("exits with non-zero code for unknown skill", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(["skills", "uninstall", "nonexistent", "--yes"], {
          cwd: temp.path,
        });

        expect(result.exitCode).not.toBe(0);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("--dry-run flag", () => {
    it("shows plan without making changes", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--yes",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        const result = await runCli(["skills", "uninstall", "my-skill", "--dry-run"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);
        // Should show dry-run message
        expect(result.stdout).toContain("Dry-run complete. No changes made.");
        // Should show the skill in the plan
        expect(result.stdout).toContain("my-skill");

        // Verify skill files still exist (no changes made)
        const canonicalSkillDir = path.join(temp.path, ".axm", "skills", "my-skill");
        expect(fs.existsSync(canonicalSkillDir)).toBe(true);

        const agentSkillDir = path.join(temp.path, ".claude", "commands", "my-skill");
        expect(fs.existsSync(agentSkillDir)).toBe(true);
      } finally {
        temp.cleanup();
      }
    });

    it("does not modify lockfile or settings", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--yes",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        // Get original file contents
        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const originalLock = fs.readFileSync(lockPath, "utf-8");
        const originalSettings = fs.readFileSync(settingsPath, "utf-8");

        // Run dry-run
        await runCli(["skills", "uninstall", "my-skill", "--dry-run"], {
          cwd: temp.path,
        });

        // Verify files unchanged
        expect(fs.readFileSync(lockPath, "utf-8")).toBe(originalLock);
        expect(fs.readFileSync(settingsPath, "utf-8")).toBe(originalSettings);
      } finally {
        temp.cleanup();
      }
    });

    it("shows uninstall plan with skill and agents", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--yes",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        const result = await runCli(["skills", "uninstall", "my-skill", "--dry-run"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);
        // Should show plan format with skill and agent info
        expect(result.stdout).toContain("my-skill");
        expect(result.stdout).toContain("claude-code");
      } finally {
        temp.cleanup();
      }
    });

    it("shows summary with count", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--yes",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        const result = await runCli(["skills", "uninstall", "my-skill", "--dry-run"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);
        // Should show summary
        expect(result.stdout).toMatch(/\d+ (skill|to uninstall|to remove)/i);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("--yes flag", () => {
    it("skips confirmation prompt", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--yes",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        // Uninstall with --yes should complete without requiring input
        const result = await runCli(["skills", "uninstall", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);

        // Skill should be removed
        const canonicalSkillDir = path.join(temp.path, ".axm", "skills", "my-skill");
        expect(fs.existsSync(canonicalSkillDir)).toBe(false);
      } finally {
        temp.cleanup();
      }
    });

    it("proceeds directly to uninstall", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes", "--agent", "claude-code"],
          { cwd: temp.path },
        );

        const result = await runCli(["skills", "uninstall", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);

        // Only my-skill should be removed, another-skill should remain
        const mySkillDir = path.join(temp.path, ".axm", "skills", "my-skill");
        const anotherSkillDir = path.join(temp.path, ".axm", "skills", "another-skill");
        expect(fs.existsSync(mySkillDir)).toBe(false);
        expect(fs.existsSync(anotherSkillDir)).toBe(true);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("--agent flag", () => {
    it("uninstalls from specific agent only", async () => {
      const temp = createTempDir();
      try {
        // Initialize with multiple agents
        await runCli(["init", "--yes", "--agent", "claude-code", "--agent", "cursor"], {
          cwd: temp.path,
        });

        // Install skill to both agents
        await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--yes",
            "--agent",
            "claude-code",
            "--agent",
            "cursor",
          ],
          { cwd: temp.path },
        );

        // Uninstall from claude-code only
        const result = await runCli(
          ["skills", "uninstall", "my-skill", "--yes", "--agent", "claude-code"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);

        // Symlink should be removed from claude-code
        const claudeSkillDir = path.join(temp.path, ".claude", "commands", "my-skill");
        expect(fs.existsSync(claudeSkillDir)).toBe(false);

        // Symlink should remain in cursor
        const cursorSkillDir = path.join(temp.path, ".cursor", "rules", "my-skill");
        expect(fs.existsSync(cursorSkillDir)).toBe(true);

        // Canonical copy should still exist (still used by cursor)
        const canonicalSkillDir = path.join(temp.path, ".axm", "skills", "my-skill");
        expect(fs.existsSync(canonicalSkillDir)).toBe(true);

        // Lockfile should still have the skill but with updated agents
        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        expect(lock.skills?.["my-skill"]).toBeDefined();
        expect(lock.skills["my-skill"].agents).not.toContain("claude-code");
        expect(lock.skills["my-skill"].agents).toContain("cursor");
      } finally {
        temp.cleanup();
      }
    });

    it("removes canonical when uninstalling from last agent", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code", "--agent", "cursor"], {
          cwd: temp.path,
        });

        await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--yes",
            "--agent",
            "claude-code",
            "--agent",
            "cursor",
          ],
          { cwd: temp.path },
        );

        // Uninstall from claude-code
        await runCli(["skills", "uninstall", "my-skill", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        // Uninstall from cursor (last agent)
        const result = await runCli(
          ["skills", "uninstall", "my-skill", "--yes", "--agent", "cursor"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);

        // Canonical copy should be removed (no agents left)
        const canonicalSkillDir = path.join(temp.path, ".axm", "skills", "my-skill");
        expect(fs.existsSync(canonicalSkillDir)).toBe(false);

        // Lockfile entry should be removed
        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        expect(lock.skills?.["my-skill"]).toBeUndefined();
      } finally {
        temp.cleanup();
      }
    });

    it("keeps canonical when other agents still have skill", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code", "--agent", "cursor"], {
          cwd: temp.path,
        });

        await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--yes",
            "--agent",
            "claude-code",
            "--agent",
            "cursor",
          ],
          { cwd: temp.path },
        );

        // Uninstall from claude-code only
        await runCli(["skills", "uninstall", "my-skill", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        // Canonical should still exist
        const canonicalSkillDir = path.join(temp.path, ".axm", "skills", "my-skill");
        expect(fs.existsSync(canonicalSkillDir)).toBe(true);

        // SKILL.md should still be there
        const skillMdPath = path.join(canonicalSkillDir, "SKILL.md");
        expect(fs.existsSync(skillMdPath)).toBe(true);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("--json flag", () => {
    it("outputs valid JSON", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--yes",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        const result = await runCli(["skills", "uninstall", "my-skill", "--dry-run", "--json"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);

        // Should be valid JSON
        const json = JSON.parse(result.stdout);
        expect(json).toBeDefined();
      } finally {
        temp.cleanup();
      }
    });

    it("includes changes array with uninstall steps", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--yes",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        const result = await runCli(["skills", "uninstall", "my-skill", "--dry-run", "--json"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);

        const json = JSON.parse(result.stdout);
        expect(json.changes).toBeDefined();
        expect(Array.isArray(json.changes)).toBe(true);
        expect(json.changes.length).toBeGreaterThan(0);

        // Should have an uninstall/remove step for my-skill
        const uninstallStep = json.changes.find(
          (c: { _tag: string; name?: string; skillName?: string }) =>
            (c._tag === "Remove" || c._tag === "UninstallSkill") &&
            (c.name === "my-skill" || c.skillName === "my-skill"),
        );
        expect(uninstallStep).toBeDefined();
      } finally {
        temp.cleanup();
      }
    });

    it("includes summary with remove count", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--yes",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        const result = await runCli(["skills", "uninstall", "my-skill", "--dry-run", "--json"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);

        const json = JSON.parse(result.stdout);
        expect(json.summary).toBeDefined();
        expect(json.summary.remove).toBeGreaterThan(0);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("--help", () => {
    it("displays usage information", async () => {
      const result = await runCli(["skills", "uninstall", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("skills uninstall");
      expect(result.stdout).toContain("--agent");
      expect(result.stdout).toContain("--yes");
      expect(result.stdout).toContain("--dry-run");
      expect(result.stdout).toContain("--json");
    });
  });

  describe("file system state verification", () => {
    it("removes only the specified skill", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        // Install multiple skills
        await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes", "--agent", "claude-code"],
          { cwd: temp.path },
        );

        // Uninstall only my-skill
        const result = await runCli(["skills", "uninstall", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);

        // my-skill should be removed
        const mySkillDir = path.join(temp.path, ".axm", "skills", "my-skill");
        expect(fs.existsSync(mySkillDir)).toBe(false);

        // another-skill should remain
        const anotherSkillDir = path.join(temp.path, ".axm", "skills", "another-skill");
        expect(fs.existsSync(anotherSkillDir)).toBe(true);

        // Lockfile should only have another-skill
        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        expect(lock.skills?.["my-skill"]).toBeUndefined();
        expect(lock.skills?.["another-skill"]).toBeDefined();
      } finally {
        temp.cleanup();
      }
    });

    it("cleans up empty skills directory", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        // Install one skill
        await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--yes",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        // Uninstall the only skill
        await runCli(["skills", "uninstall", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        // Skills directory should still exist (empty is fine) or be removed
        const skillsDir = path.join(temp.path, ".axm", "skills");
        if (fs.existsSync(skillsDir)) {
          const contents = fs.readdirSync(skillsDir);
          expect(contents).toHaveLength(0);
        }
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("uninitialized workspace", () => {
    it("shows error when workspace is not initialized", async () => {
      const temp = createTempDir();
      try {
        // Do not initialize

        const result = await runCli(["skills", "uninstall", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("Error");
      } finally {
        temp.cleanup();
      }
    });
  });
});
