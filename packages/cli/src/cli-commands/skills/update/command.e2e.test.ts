/**
 * E2E tests for the `axm skills update` command.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";

describe("axm skills update", () => {
  describe("no installed skills", () => {
    it("exits 0 with no-skills message when nothing is installed", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes"], {
          cwd: temp.path,
        });

        const result = await runCli(["skills", "update", "--yes"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/no skills installed/i);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("update local source skill", () => {
    it("refreshes files and updates lockfile updatedAt timestamp", async () => {
      const temp = createTempDir();
      try {
        // Initialize workspace
        await runCli(["init", "--yes"], {
          cwd: temp.path,
        });

        // Install all skills
        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes"], {
          cwd: temp.path,
        });

        // Record lockfile state before update
        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lockBefore = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        const updatedAtBefore = lockBefore.skills["my-skill"].updatedAt;

        // Wait to ensure timestamp difference
        await new Promise((r) => setTimeout(r, 50));

        // Run update
        const result = await runCli(["skills", "update", "--yes"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);

        // Verify lockfile updatedAt changed (local sources always re-install)
        const lockAfter = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        const updatedAtAfter = lockAfter.skills["my-skill"].updatedAt;
        expect(new Date(updatedAtAfter).getTime()).toBeGreaterThan(
          new Date(updatedAtBefore).getTime(),
        );

        // Verify skill files still exist
        const skillDir = path.join(
          temp.path,
          ".axm",
          "extensions",
          "external",
          "skills",
          "my-skill",
        );
        expect(fs.existsSync(skillDir)).toBe(true);
        expect(fs.existsSync(path.join(skillDir, "SKILL.md"))).toBe(true);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("--preview shows plan without applying", () => {
    it("displays plan but does not change lockfile", async () => {
      const temp = createTempDir();
      try {
        // Initialize and install
        await runCli(["init", "--yes"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes"], {
          cwd: temp.path,
        });

        // Record lockfile state before preview
        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lockBefore = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        const updatedAtBefore = lockBefore.skills["my-skill"].updatedAt;

        // Wait to ensure any timestamp difference would be visible
        await new Promise((r) => setTimeout(r, 50));

        // Run update with --preview --non-interactive (no prompts, no apply)
        const result = await runCli(["skills", "update", "--preview", "--non-interactive"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);
        // Should show preview message
        expect(result.stdout).toContain("Previewing changes...");
        // Should show skill names in plan
        expect(result.stdout).toContain("my-skill");
        expect(result.stdout).toContain("another-skill");

        // Verify lockfile was NOT changed (preview does not apply)
        const lockAfter = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        const updatedAtAfter = lockAfter.skills["my-skill"].updatedAt;
        expect(updatedAtAfter).toBe(updatedAtBefore);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("skip conditions", () => {
    it("skips disabled skills during update", async () => {
      const temp = createTempDir();
      try {
        // Initialize and install
        await runCli(["init", "--yes"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes"], {
          cwd: temp.path,
        });

        // Disable my-skill
        await runCli(["skills", "disable", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        // Record lockfile state before update
        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lockBefore = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        const anotherUpdatedBefore = lockBefore.skills["another-skill"].updatedAt;

        // Wait to ensure timestamp difference
        await new Promise((r) => setTimeout(r, 50));

        // Run update
        const result = await runCli(["skills", "update", "--yes"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);
        // Should log that my-skill was skipped (disabled)
        expect(result.stdout).toMatch(/[Ss]kipping.*my-skill.*disabled/);

        // another-skill should have been updated (updatedAt changed)
        const lockAfter = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        const anotherUpdatedAfter = lockAfter.skills["another-skill"].updatedAt;
        expect(new Date(anotherUpdatedAfter).getTime()).toBeGreaterThan(
          new Date(anotherUpdatedBefore).getTime(),
        );
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("--skill filters correctly", () => {
    it("updates only the named skill when --skill is provided", async () => {
      const temp = createTempDir();
      try {
        // Initialize and install both skills
        await runCli(["init", "--yes"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes"], {
          cwd: temp.path,
        });

        // Record lockfile state before update
        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lockBefore = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        const mySkillUpdatedBefore = lockBefore.skills["my-skill"].updatedAt;
        const anotherSkillUpdatedBefore = lockBefore.skills["another-skill"].updatedAt;

        // Wait to ensure timestamp difference
        await new Promise((r) => setTimeout(r, 50));

        // Update only my-skill
        const result = await runCli(["skills", "update", "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);

        // Verify only my-skill was updated
        const lockAfter = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        const mySkillUpdatedAfter = lockAfter.skills["my-skill"].updatedAt;
        const anotherSkillUpdatedAfter = lockAfter.skills["another-skill"].updatedAt;

        // my-skill should have a newer updatedAt
        expect(new Date(mySkillUpdatedAfter).getTime()).toBeGreaterThan(
          new Date(mySkillUpdatedBefore).getTime(),
        );

        // another-skill should be unchanged
        expect(anotherSkillUpdatedAfter).toBe(anotherSkillUpdatedBefore);
      } finally {
        temp.cleanup();
      }
    });
  });
});
