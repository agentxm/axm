/**
 * Smoke tests for E2E test utilities.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  copySkillsRepoFixture,
  createTempDir,
  FIXTURES_PATH,
  runCli,
  SKILLS_REPO_FIXTURE,
} from "./utils.js";

describe("E2E test utilities", () => {
  describe("createTempDir", () => {
    it("creates a temporary directory", () => {
      const temp = createTempDir();
      try {
        expect(fs.existsSync(temp.path)).toBe(true);
        expect(fs.statSync(temp.path).isDirectory()).toBe(true);
      } finally {
        temp.cleanup();
      }
    });

    it("cleans up the directory when cleanup is called", () => {
      const temp = createTempDir();
      const tempPath = temp.path;
      temp.cleanup();
      expect(fs.existsSync(tempPath)).toBe(false);
    });

    it("uses the provided prefix", () => {
      const temp = createTempDir("my-prefix-");
      try {
        expect(path.basename(temp.path).startsWith("my-prefix-")).toBe(true);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("FIXTURES_PATH and SKILLS_REPO_FIXTURE", () => {
    it("points to existing fixtures directory", () => {
      expect(fs.existsSync(FIXTURES_PATH)).toBe(true);
    });

    it("points to existing skills-repo fixture", () => {
      expect(fs.existsSync(SKILLS_REPO_FIXTURE)).toBe(true);
    });

    it("has SKILL.md files in skills-repo fixture", () => {
      const mySkillMd = path.join(SKILLS_REPO_FIXTURE, "my-skill", "SKILL.md");
      const anotherSkillMd = path.join(SKILLS_REPO_FIXTURE, "another-skill", "SKILL.md");
      expect(fs.existsSync(mySkillMd)).toBe(true);
      expect(fs.existsSync(anotherSkillMd)).toBe(true);
    });
  });

  describe("copySkillsRepoFixture", () => {
    it("copies the skills repo to a temp directory", () => {
      const temp = copySkillsRepoFixture();
      try {
        const mySkillMd = path.join(temp.path, "my-skill", "SKILL.md");
        expect(fs.existsSync(mySkillMd)).toBe(true);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("runCli", () => {
    it("runs the CLI and captures output", async () => {
      const result = await runCli(["--version"]);
      expect(result.exitCode).toBe(0);
      expect(typeof result.stdout).toBe("string");
      expect(typeof result.stderr).toBe("string");
    });

    it("captures non-zero exit codes", async () => {
      const result = await runCli(["nonexistent-command"]);
      expect(result.exitCode).not.toBe(0);
    });

    it("respects the cwd option", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["--help"], { cwd: temp.path });
        expect(result.exitCode).toBe(0);
      } finally {
        temp.cleanup();
      }
    });
  });
});
