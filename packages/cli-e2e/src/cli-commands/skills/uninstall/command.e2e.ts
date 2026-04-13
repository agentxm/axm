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
import { getOutput } from "../../../test-helpers.js";

describe("axm skills uninstall", () => {
  describe("basic uninstall flow", () => {
    it("uninstalls a skill from all agents", async () => {
      const temp = createTempDir();
      try {
        // Initialize workspace
        await runCli(["init", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        // Install a skill first
        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

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

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

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
        await runCli(["init", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        const result = await runCli(["skills", "uninstall", "unknown-skill", "--yes"], {
          cwd: temp.path,
        });

        // Per spec: literal name not in lockfile builds a no-op plan, exits 0
        expect(result.exitCode).toBe(0);
        expect(getOutput(result)).toContain("not installed");
      } finally {
        temp.cleanup();
      }
    });

    it("exits successfully with no-op for nonexistent skill", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--non-interactive"], {
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

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        const result = await runCli(
          ["skills", "uninstall", "my-skill", "--preview", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        expect(result.exitCode).toBe(0);
        expect(getOutput(result)).toContain("my-skill");

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
        await runCli(["init", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

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
        await runCli(["init", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        const result = await runCli(
          ["skills", "uninstall", "my-skill", "--preview", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        expect(result.exitCode).toBe(0);
        expect(getOutput(result)).toContain("my-skill");
      } finally {
        temp.cleanup();
      }
    });

    it("shows summary with count", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        const result = await runCli(
          ["skills", "uninstall", "my-skill", "--preview", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        expect(result.exitCode).toBe(0);
        expect(getOutput(result)).toMatch(/\d+ to apply/);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("--yes flag", () => {
    it("skips confirmation prompt", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

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
        await runCli(["init", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes"], {
          cwd: temp.path,
        });

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

  describe("--help", () => {
    it("displays usage information", async () => {
      const result = await runCli(["skills", "uninstall", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("skills uninstall");
      expect(result.stdout).toContain("--yes");
      expect(result.stdout).toContain("--preview");
      // Verify removed flag is not in help output
      expect(result.stdout).not.toContain("--agent");
    });
  });

  describe("file system state verification", () => {
    it("removes only the specified skill", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        // Install multiple skills
        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes"], {
          cwd: temp.path,
        });

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
        await runCli(["init", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        // Install one skill
        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

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
    it("fails with an explicit init instruction when workspace is not initialized", async () => {
      const temp = createTempDir();
      try {
        // Do not initialize. Uninstall requires an explicit workspace bootstrap.

        const result = await runCli(
          ["skills", "uninstall", "my-skill", "--yes", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        expect(result.exitCode).toBe(1);
        expect(getOutput(result)).toContain("axm init");
      } finally {
        temp.cleanup();
      }
    });
  });
});
