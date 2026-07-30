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
import { getOutput } from "../../../test-helpers.js";

const setupWorkspaceWithoutBundledSkill = async (cwd: string): Promise<void> => {
  const setup = await runCli(["setup", "--yes", "--non-interactive"], { cwd });
  expect(setup.exitCode).toBe(0);

  const uninstall = await runCli(["skills", "uninstall", "axm", "--yes", "--keep-source"], { cwd });
  expect(uninstall.exitCode).toBe(0);
};

const copySkillsFixture = (cwd: string): string => {
  const source = path.join(cwd, "skills-source");
  fs.cpSync(SKILLS_REPO_FIXTURE, source, { recursive: true });
  return source;
};

const changeSkillSource = (source: string, name: string): void => {
  fs.appendFileSync(path.join(source, name, "SKILL.md"), "\nSource update for E2E.\n");
};

const installedSkillContent = (cwd: string, name: string): string =>
  fs.readFileSync(
    path.join(cwd, ".axm", "extensions", "external", "skills", name, "SKILL.md"),
    "utf-8",
  );

describe("axm skills update", () => {
  describe("no installed skills", () => {
    it("exits 0 with no-skills message when nothing is installed", async () => {
      const temp = createTempDir();
      try {
        await setupWorkspaceWithoutBundledSkill(temp.path);

        const result = await runCli(["skills", "update", "--yes"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);
        expect(getOutput(result)).toMatch(/no skills installed/i);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("update local source skill", () => {
    it("refreshes changed source files and their receipt hash", async () => {
      const temp = createTempDir();
      try {
        // Initialize workspace
        await setupWorkspaceWithoutBundledSkill(temp.path);

        const source = copySkillsFixture(temp.path);
        await runCli(["skills", "install", source, "--all", "--yes"], {
          cwd: temp.path,
        });

        // Record lockfile state before update
        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lockBefore = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settingsBefore = fs.readFileSync(settingsPath, "utf-8");

        changeSkillSource(source, "my-skill");

        // Run update
        const result = await runCli(["skills", "update", "--yes"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);

        const lockAfter = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        expect(lockAfter.skills["my-skill"]).toMatchObject({
          type: lockBefore.skills["my-skill"].type,
          path: lockBefore.skills["my-skill"].path,
          installedAt: lockBefore.skills["my-skill"].installedAt,
        });
        expect(lockAfter.skills["my-skill"].sourceHash).not.toBe(
          lockBefore.skills["my-skill"].sourceHash,
        );
        expect(lockAfter.skills["my-skill"].updatedAt).not.toBe(
          lockBefore.skills["my-skill"].updatedAt,
        );
        expect(lockAfter.skills["another-skill"]).toEqual(lockBefore.skills["another-skill"]);
        expect(fs.readFileSync(settingsPath, "utf-8")).toBe(settingsBefore);

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
        expect(fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf-8")).toContain(
          "Source update for E2E.",
        );
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
        await setupWorkspaceWithoutBundledSkill(temp.path);

        const source = copySkillsFixture(temp.path);
        await runCli(["skills", "install", source, "--all", "--yes"], {
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
        const output = getOutput(result);
        expect(output).toContain("Would update");
        expect(output).toContain("my-skill");
        expect(output).toContain("another-skill");

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
        await setupWorkspaceWithoutBundledSkill(temp.path);

        const source = copySkillsFixture(temp.path);
        await runCli(["skills", "install", source, "--all", "--yes"], {
          cwd: temp.path,
        });

        // Disable my-skill
        await runCli(["skills", "disable", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        // Record lockfile state before update
        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lockBefore = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settingsBefore = fs.readFileSync(settingsPath, "utf-8");

        changeSkillSource(source, "my-skill");
        changeSkillSource(source, "another-skill");

        // Run update
        const result = await runCli(["skills", "update", "--yes"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);

        const lockAfter = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        expect(lockAfter.skills["my-skill"]).toEqual(lockBefore.skills["my-skill"]);
        expect(lockAfter.skills["another-skill"].sourceHash).not.toBe(
          lockBefore.skills["another-skill"].sourceHash,
        );
        expect(lockAfter.skills["another-skill"].updatedAt).not.toBe(
          lockBefore.skills["another-skill"].updatedAt,
        );
        expect(fs.readFileSync(settingsPath, "utf-8")).toBe(settingsBefore);
        expect(installedSkillContent(temp.path, "my-skill")).not.toContain(
          "Source update for E2E.",
        );
        expect(installedSkillContent(temp.path, "another-skill")).toContain(
          "Source update for E2E.",
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
        await setupWorkspaceWithoutBundledSkill(temp.path);

        const source = copySkillsFixture(temp.path);
        await runCli(["skills", "install", source, "--all", "--yes"], {
          cwd: temp.path,
        });

        // Record lockfile state before update
        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lockBefore = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settingsBefore = fs.readFileSync(settingsPath, "utf-8");

        changeSkillSource(source, "my-skill");
        changeSkillSource(source, "another-skill");

        // Update only my-skill
        const result = await runCli(["skills", "update", "--skill", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);

        const lockAfter = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        expect(lockAfter.skills["my-skill"].sourceHash).not.toBe(
          lockBefore.skills["my-skill"].sourceHash,
        );
        expect(lockAfter.skills["my-skill"].updatedAt).not.toBe(
          lockBefore.skills["my-skill"].updatedAt,
        );
        expect(lockAfter.skills["another-skill"]).toEqual(lockBefore.skills["another-skill"]);
        expect(fs.readFileSync(settingsPath, "utf-8")).toBe(settingsBefore);
        expect(installedSkillContent(temp.path, "my-skill")).toContain("Source update for E2E.");
        expect(installedSkillContent(temp.path, "another-skill")).not.toContain(
          "Source update for E2E.",
        );
      } finally {
        temp.cleanup();
      }
    });
  });
});
