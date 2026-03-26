/**
 * E2E tests for the `axm skills disable` command.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";
import { getOutput } from "../../../test-helpers.js";

describe("axm skills disable", () => {
  it("disables a skill: removes symlinks, preserves canonical files and settings with enabled: false, retains lockfile", async () => {
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
      const agentSkillDir = path.join(temp.path, ".claude", "skills", "my-skill");
      expect(fs.existsSync(agentSkillDir)).toBe(true);

      // Disable the skill
      const result = await runCli(["skills", "disable", "my-skill", "--yes"], {
        cwd: temp.path,
      });

      expect(result.exitCode).toBe(0);

      // Verify canonical skill files are preserved (not removed)
      expect(fs.existsSync(canonicalSkillDir)).toBe(true);

      // Verify agent symlink is removed
      expect(fs.existsSync(agentSkillDir)).toBe(false);

      // Verify settings preserved with enabled: false
      const settingsPath = path.join(temp.path, ".axm", "settings.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settings.skills).toBeDefined();
      expect(settings.skills["my-skill"]).toBeDefined();
      // Collapsed form for disabled: { source: "...", enabled: false }
      const entry = settings.skills["my-skill"];
      expect(typeof entry).toBe("object");
      expect(entry.enabled).toBe(false);
      expect(entry.source).toBeDefined();

      // Verify lockfile entry retained
      const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
      const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
      expect(lock.skills["my-skill"]).toBeDefined();
    } finally {
      temp.cleanup();
    }
  });

  it("shows already disabled message for already disabled skill", async () => {
    const temp = createTempDir();
    try {
      await runCli(["init", "--yes", "--non-interactive"], {
        cwd: temp.path,
      });

      await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
        cwd: temp.path,
      });

      // Disable once
      await runCli(["skills", "disable", "my-skill", "--yes"], {
        cwd: temp.path,
      });

      // Disable again — should indicate already disabled
      const result = await runCli(["skills", "disable", "my-skill", "--yes"], {
        cwd: temp.path,
      });

      expect(result.exitCode).toBe(0);
      expect(getOutput(result)).toMatch(/already disabled/i);
    } finally {
      temp.cleanup();
    }
  });

  it("errors when skill is not found", async () => {
    const temp = createTempDir();
    try {
      await runCli(["init", "--yes", "--non-interactive"], {
        cwd: temp.path,
      });

      const result = await runCli(["skills", "disable", "nonexistent-skill", "--yes"], {
        cwd: temp.path,
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("is not installed");
    } finally {
      temp.cleanup();
    }
  });

  describe("--help", () => {
    it("displays usage information", async () => {
      const result = await runCli(["skills", "disable", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("skills disable");
      expect(result.stdout).toContain("--yes");
    });
  });
});
