/**
 * E2E tests for the `axm skills enable` command.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";
import { getOutput } from "../../../test-helpers.js";

describe("axm skills enable", () => {
  it("enables a disabled skill: re-creates symlinks and updates settings", async () => {
    const temp = createTempDir();
    try {
      // Initialize workspace with claude-code agent to verify .claude/ symlinks
      await runCli(["setup", "--yes", "--agent", "claude-code"], {
        cwd: temp.path,
      });

      // Install a skill
      await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
        cwd: temp.path,
      });

      // Disable the skill first
      await runCli(["skills", "disable", "my-skill", "--yes"], {
        cwd: temp.path,
      });

      // Verify canonical files are preserved after disable
      const canonicalSkillDir = path.join(
        temp.path,
        ".axm",
        "extensions",
        "external",
        "skills",
        "my-skill",
      );
      expect(fs.existsSync(canonicalSkillDir)).toBe(true);

      // Verify agent symlink is removed after disable
      const agentSkillDir = path.join(temp.path, ".claude", "skills", "my-skill");
      expect(fs.existsSync(agentSkillDir)).toBe(false);

      // Enable the skill
      const result = await runCli(["skills", "enable", "my-skill", "--yes"], {
        cwd: temp.path,
      });

      expect(result.exitCode).toBe(0);

      // Verify canonical skill files still exist
      expect(fs.existsSync(canonicalSkillDir)).toBe(true);
      expect(fs.existsSync(path.join(canonicalSkillDir, "SKILL.md"))).toBe(true);

      // Verify agent symlink is restored
      expect(fs.existsSync(agentSkillDir)).toBe(true);

      // Verify settings updated (collapsed to string or enabled: true)
      const settingsPath = path.join(temp.path, ".axm", "settings.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settings.skills["my-skill"]).toBeDefined();
      const entry = settings.skills["my-skill"];
      // When enabled, schema encode collapses to just the source string
      if (typeof entry === "string") {
        // Collapsed to string — correct
        expect(entry.length).toBeGreaterThan(0);
      } else {
        // Object form — enabled should be true (or absent, defaulting to true)
        expect(entry.enabled).not.toBe(false);
      }

      // Verify lockfile entry still exists
      const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
      const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
      expect(lock.skills["my-skill"]).toBeDefined();
    } finally {
      temp.cleanup();
    }
  });

  it("shows already enabled message for already enabled skill", async () => {
    const temp = createTempDir();
    try {
      await runCli(["setup", "--yes", "--non-interactive"], {
        cwd: temp.path,
      });

      await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
        cwd: temp.path,
      });

      // Enable without disabling first — should indicate already enabled
      const result = await runCli(["skills", "enable", "my-skill", "--yes"], {
        cwd: temp.path,
      });

      expect(result.exitCode).toBe(0);
      expect(getOutput(result)).toMatch(/already enabled/i);
    } finally {
      temp.cleanup();
    }
  });

  it("errors when skill is not found", async () => {
    const temp = createTempDir();
    try {
      await runCli(["setup", "--yes", "--non-interactive"], {
        cwd: temp.path,
      });

      const result = await runCli(["skills", "enable", "nonexistent-skill", "--yes"], {
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
      const result = await runCli(["skills", "enable", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("skills enable");
      expect(result.stdout).toContain("--yes");
    });
  });
});
