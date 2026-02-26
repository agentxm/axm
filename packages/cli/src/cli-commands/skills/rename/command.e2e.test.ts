/**
 * E2E tests for the `axm skills rename` command.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";

describe("axm skills rename", () => {
  it("renames a skill: updates settings, lockfile, and filesystem", async () => {
    const temp = createTempDir();
    try {
      // Initialize workspace with claude-code agent to verify .claude/ symlinks
      await runCli(["init", "--yes", "--agent", "claude-code"], {
        cwd: temp.path,
      });

      // Install a skill
      await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
        cwd: temp.path,
      });

      // Verify original skill exists
      const oldCanonical = path.join(
        temp.path,
        ".axm",
        "extensions",
        "external",
        "skills",
        "my-skill",
      );
      expect(fs.existsSync(oldCanonical)).toBe(true);

      // Rename the skill
      const result = await runCli(["skills", "rename", "my-skill", "renamed-skill", "--yes"], {
        cwd: temp.path,
      });

      expect(result.exitCode).toBe(0);

      // Verify old canonical directory is gone
      expect(fs.existsSync(oldCanonical)).toBe(false);

      // Verify new canonical directory exists
      const newCanonical = path.join(
        temp.path,
        ".axm",
        "extensions",
        "external",
        "skills",
        "renamed-skill",
      );
      expect(fs.existsSync(newCanonical)).toBe(true);
      expect(fs.existsSync(path.join(newCanonical, "SKILL.md"))).toBe(true);

      // Verify old agent symlink is gone, new one exists
      const oldAgentDir = path.join(temp.path, ".claude", "skills", "my-skill");
      const newAgentDir = path.join(temp.path, ".claude", "skills", "renamed-skill");
      expect(fs.existsSync(oldAgentDir)).toBe(false);
      expect(fs.existsSync(newAgentDir)).toBe(true);

      // Verify settings key changed
      const settingsPath = path.join(temp.path, ".axm", "settings.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settings.skills["my-skill"]).toBeUndefined();
      expect(settings.skills["renamed-skill"]).toBeDefined();

      // Verify lockfile key changed
      const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
      const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
      expect(lock.skills["my-skill"]).toBeUndefined();
      expect(lock.skills["renamed-skill"]).toBeDefined();
    } finally {
      temp.cleanup();
    }
  });

  it("errors when old name is not found", async () => {
    const temp = createTempDir();
    try {
      await runCli(["init", "--yes"], {
        cwd: temp.path,
      });

      const result = await runCli(["skills", "rename", "nonexistent", "new-name", "--yes"], {
        cwd: temp.path,
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("not found");
    } finally {
      temp.cleanup();
    }
  });

  it("errors when new name conflicts with existing skill", async () => {
    const temp = createTempDir();
    try {
      await runCli(["init", "--yes"], {
        cwd: temp.path,
      });

      // Install both skills
      await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes"], {
        cwd: temp.path,
      });

      // Try to rename my-skill to another-skill (conflict)
      const result = await runCli(["skills", "rename", "my-skill", "another-skill", "--yes"], {
        cwd: temp.path,
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("already exists");
    } finally {
      temp.cleanup();
    }
  });

  describe("--help", () => {
    it("displays usage information", async () => {
      const result = await runCli(["skills", "rename", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("skills rename");
      expect(result.stdout).toContain("--yes");
    });
  });
});
