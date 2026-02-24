/**
 * E2E tests for the `axm skills uninstall` command.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";

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
        const canonicalSkillDir = path.join(
          temp.path,
          ".axm",
          "extensions",
          "external",
          "skills",
          "my-skill",
        );
        expect(fs.existsSync(canonicalSkillDir)).toBe(true);

        // Uninstall the skill
        const result = await runCli(["skills", "uninstall", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);

        // Verify canonical copy is removed
        expect(fs.existsSync(canonicalSkillDir)).toBe(false);

        // Verify symlink in agent directory is removed
        const agentSkillDir = path.join(temp.path, ".claude", "skills", "my-skill");
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
        const agentSkillDir = path.join(temp.path, ".claude", "skills", "my-skill");
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

  describe("skill not found", () => {
    it("shows no-op for literal name not in lockfile", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(["skills", "uninstall", "unknown-skill", "--yes"], {
          cwd: temp.path,
        });

        // Per spec: literal name not in lockfile builds a no-op plan, exits 0
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("not installed");
      } finally {
        temp.cleanup();
      }
    });

    it("exits successfully with no-op for nonexistent skill", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(["skills", "uninstall", "nonexistent", "--yes"], {
          cwd: temp.path,
        });

        // Per spec: no-op plan, exits 0
        expect(result.exitCode).toBe(0);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("--preview flag", () => {
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

        const result = await runCli(
          ["skills", "uninstall", "my-skill", "--preview", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        expect(result.exitCode).toBe(0);
        // Should show the skill in the plan
        expect(result.stdout).toContain("my-skill");

        // Verify skill files still exist (no changes made in non-interactive preview)
        const canonicalSkillDir = path.join(
          temp.path,
          ".axm",
          "extensions",
          "external",
          "skills",
          "my-skill",
        );
        expect(fs.existsSync(canonicalSkillDir)).toBe(true);

        const agentSkillDir = path.join(temp.path, ".claude", "skills", "my-skill");
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

        // Run preview
        await runCli(["skills", "uninstall", "my-skill", "--preview", "--non-interactive"], {
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

        const result = await runCli(
          ["skills", "uninstall", "my-skill", "--preview", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        expect(result.exitCode).toBe(0);
        // Should show plan with skill name
        expect(result.stdout).toContain("my-skill");
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

        const result = await runCli(
          ["skills", "uninstall", "my-skill", "--preview", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        expect(result.exitCode).toBe(0);
        // Should show summary with counts
        expect(result.stdout).toMatch(/\d+ to apply/);
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
        const canonicalSkillDir = path.join(
          temp.path,
          ".axm",
          "extensions",
          "external",
          "skills",
          "my-skill",
        );
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
        const mySkillDir = path.join(
          temp.path,
          ".axm",
          "extensions",
          "external",
          "skills",
          "my-skill",
        );
        const anotherSkillDir = path.join(
          temp.path,
          ".axm",
          "extensions",
          "external",
          "skills",
          "another-skill",
        );
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
        const claudeSkillDir = path.join(temp.path, ".claude", "skills", "my-skill");
        expect(fs.existsSync(claudeSkillDir)).toBe(false);

        // Symlink should remain in cursor
        const cursorSkillDir = path.join(temp.path, ".cursor", "skills", "my-skill");
        expect(fs.existsSync(cursorSkillDir)).toBe(true);

        // Canonical copy should still exist (still used by cursor)
        const canonicalSkillDir = path.join(
          temp.path,
          ".axm",
          "extensions",
          "external",
          "skills",
          "my-skill",
        );
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
        const canonicalSkillDir = path.join(
          temp.path,
          ".axm",
          "extensions",
          "external",
          "skills",
          "my-skill",
        );
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
        const canonicalSkillDir = path.join(
          temp.path,
          ".axm",
          "extensions",
          "external",
          "skills",
          "my-skill",
        );
        expect(fs.existsSync(canonicalSkillDir)).toBe(true);

        // SKILL.md should still be there
        const skillMdPath = path.join(canonicalSkillDir, "SKILL.md");
        expect(fs.existsSync(skillMdPath)).toBe(true);
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
      expect(result.stdout).toContain("--preview");
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
        const mySkillDir = path.join(
          temp.path,
          ".axm",
          "extensions",
          "external",
          "skills",
          "my-skill",
        );
        expect(fs.existsSync(mySkillDir)).toBe(false);

        // another-skill should remain
        const anotherSkillDir = path.join(
          temp.path,
          ".axm",
          "extensions",
          "external",
          "skills",
          "another-skill",
        );
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
        const skillsDir = path.join(temp.path, ".axm", "extensions", "external", "skills");
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
    it("auto-initializes and shows no-op when workspace is not initialized", async () => {
      const temp = createTempDir();
      try {
        // Do not initialize — --yes triggers auto-init with defaults

        const result = await runCli(["skills", "uninstall", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        // --yes auto-initializes workspace, then skill not found → no-op
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("not installed");
      } finally {
        temp.cleanup();
      }
    });
  });
});
