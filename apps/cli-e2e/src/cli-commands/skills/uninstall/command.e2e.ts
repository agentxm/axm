/**
 * E2E tests for the `axm skills uninstall` command.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";
import { getOutput } from "../../../test-helpers.js";
import { readLockfile } from "../../../test-support/lockfile.js";

const installedCanonicalSkillDir = (workspacePath: string, name: string): string =>
  path.dirname(fs.realpathSync(path.join(workspacePath, ".claude", "skills", name)));

describe("axm skills uninstall", () => {
  describe("basic uninstall flow", () => {
    it("uninstalls a skill from all agents", async () => {
      const temp = createTempDir();
      try {
        // Initialize workspace
        await runCli(
          ["setup", "--yes", "--scope", "project", "--non-interactive", "--agent", "claude-code"],
          {
            cwd: temp.path,
          },
        );

        // Install a skill first
        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill"], {
          cwd: temp.path,
        });

        // Verify skill is installed
        const canonicalSkillDir = installedCanonicalSkillDir(temp.path, "my-skill");
        expect(fs.existsSync(canonicalSkillDir)).toBe(true);

        expect(
          fs.lstatSync(path.join(temp.path, ".claude", "skills", "my-skill")).isSymbolicLink(),
        ).toBe(true);

        // Uninstall the skill
        const result = await runCli(["skills", "uninstall", "my-skill"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);

        // Verify canonical copy is removed
        expect(fs.existsSync(canonicalSkillDir)).toBe(false);

        // Verify symlink in agent directory is removed
        const agentSkillDir = path.join(temp.path, ".claude", "skills", "my-skill");
        expect(fs.existsSync(agentSkillDir)).toBe(false);

        // Verify skill is removed from lockfile
        const lockPath = path.join(temp.path, "axm.lock");
        const lock = readLockfile(lockPath);
        expect(lock.skills?.["my-skill"]).toBeUndefined();

        // Verify skill is removed from settings
        const settingsPath = path.join(temp.path, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.skills?.["my-skill"]).toBeUndefined();

        const lint = await runCli(["lint", "--json"], { cwd: temp.path });
        expect(lint.exitCode, `${lint.stderr}\n${lint.stdout}`).toBe(0);

        const repeat = await runCli(["skills", "uninstall", "my-skill"], {
          cwd: temp.path,
        });
        expect(repeat.exitCode).toBe(0);
        expect(getOutput(repeat)).toContain("not installed");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("skill not found", () => {
    it("shows no-op for literal name not in lockfile", async () => {
      const temp = createTempDir();
      try {
        await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        const result = await runCli(["skills", "uninstall", "unknown-skill"], {
          cwd: temp.path,
        });

        // Per spec: literal name not in lockfile builds a no-op plan, exits 0
        expect(result.exitCode).toBe(0);
        expect(getOutput(result)).toContain("not installed");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("--preview flag", () => {
    it("shows plan without making changes", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--scope", "project", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill"], {
          cwd: temp.path,
        });

        const canonicalSkillDir = installedCanonicalSkillDir(temp.path, "my-skill");

        const lockPath = path.join(temp.path, "axm.lock");
        const settingsPath = path.join(temp.path, "axm.json");
        const originalLock = fs.readFileSync(lockPath, "utf8");
        const originalSettings = fs.readFileSync(settingsPath, "utf8");

        const result = await runCli(
          ["skills", "uninstall", "my-skill", "--preview", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        expect(result.exitCode).toBe(0);
        expect(getOutput(result)).toContain("my-skill");

        // Verify skill files still exist (no changes made in non-interactive preview)
        expect(fs.existsSync(canonicalSkillDir)).toBe(true);

        const agentSkillDir = path.join(temp.path, ".claude", "skills", "my-skill");
        expect(fs.existsSync(agentSkillDir)).toBe(true);
        expect(fs.readFileSync(lockPath, "utf8")).toBe(originalLock);
        expect(fs.readFileSync(settingsPath, "utf8")).toBe(originalSettings);
        expect(getOutput(result)).toMatch(/Would uninstall \d+ skills?/);
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
      expect(result.stdout).not.toContain("--yes");
      expect(result.stdout).toContain("--preview");
      expect(result.stdout).not.toContain("--keep-source");
      expect(result.stdout).not.toContain("--delete-source");
      // Verify removed flag is not in help output
      expect(result.stdout).not.toContain("--agent");
    });
  });

  describe("file system state verification", () => {
    it("removes only the specified skill", async () => {
      const temp = createTempDir();
      try {
        await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        // Install multiple skills
        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--all"], {
          cwd: temp.path,
        });

        const mySkillDir = installedCanonicalSkillDir(temp.path, "my-skill");
        const anotherSkillDir = installedCanonicalSkillDir(temp.path, "another-skill");

        // Uninstall only my-skill
        const result = await runCli(["skills", "uninstall", "my-skill"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);

        // my-skill should be removed
        expect(fs.existsSync(mySkillDir)).toBe(false);

        // another-skill should remain
        expect(fs.existsSync(anotherSkillDir)).toBe(true);

        // Lockfile should only have another-skill
        const lockPath = path.join(temp.path, "axm.lock");
        const lock = readLockfile(lockPath);
        expect(lock.skills?.["my-skill"]).toBeUndefined();
        expect(lock.skills?.["another-skill"]).toBeDefined();
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

        const result = await runCli(["skills", "uninstall", "my-skill", "--non-interactive"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(2);
        expect(getOutput(result)).toContain("axm setup");
      } finally {
        temp.cleanup();
      }
    });
  });
});
