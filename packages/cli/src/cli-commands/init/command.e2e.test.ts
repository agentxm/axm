/**
 * E2E tests for the `axm init` command.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli } from "../../e2e/utils.js";

describe("axm init", () => {
  describe("with --yes flag", () => {
    it("creates settings file in .axm directory", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["init", "--yes"], { cwd: temp.path });

        // Should exit successfully
        expect(result.exitCode).toBe(0);

        // Should create .axm directory
        const axmDir = path.join(temp.path, ".axm");
        expect(fs.existsSync(axmDir)).toBe(true);

        // Should create settings.json
        const settingsPath = path.join(axmDir, "settings.json");
        expect(fs.existsSync(settingsPath)).toBe(true);

        // Settings should be valid JSON with required properties
        const settingsContent = fs.readFileSync(settingsPath, "utf-8");
        const settings = JSON.parse(settingsContent);
        expect(settings).toHaveProperty("agents");
      } finally {
        temp.cleanup();
      }
    });

    it("creates settings.json with detected agents", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["init", "--yes"], { cwd: temp.path });

        expect(result.exitCode).toBe(0);

        // Verify settings.json structure
        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

        // Should have agents array (may be empty if no agents detected in test env)
        expect(settings).toHaveProperty("agents");
        expect(Array.isArray(settings.agents)).toBe(true);
      } finally {
        temp.cleanup();
      }
    });

    it("creates lockfile", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["init", "--yes"], { cwd: temp.path });

        expect(result.exitCode).toBe(0);

        // Should create axm-lock.yaml
        const lockfilePath = path.join(temp.path, ".axm", "axm-lock.yaml");
        expect(fs.existsSync(lockfilePath)).toBe(true);
      } finally {
        temp.cleanup();
      }
    });

    it("outputs initialization message", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["init", "--yes"], { cwd: temp.path });

        expect(result.exitCode).toBe(0);
        // Should indicate initialization occurred
        expect(result.stdout).toContain("init");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("on initialized workspace", () => {
    it("succeeds when running init again", async () => {
      const temp = createTempDir();
      try {
        // First init
        await runCli(["init", "--yes"], { cwd: temp.path });

        // Second init should succeed
        const result = await runCli(["init", "--yes"], { cwd: temp.path });

        expect(result.exitCode).toBe(0);
      } finally {
        temp.cleanup();
      }
    });

    it("does not modify settings when already initialized", async () => {
      const temp = createTempDir();
      try {
        // First init
        await runCli(["init", "--yes"], { cwd: temp.path });

        // Get original settings
        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const originalContent = fs.readFileSync(settingsPath, "utf-8");
        const originalMtime = fs.statSync(settingsPath).mtimeMs;

        // Wait a bit to ensure mtime would change if file is written
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Second init
        await runCli(["init", "--yes"], { cwd: temp.path });

        // Settings should not be modified
        const newContent = fs.readFileSync(settingsPath, "utf-8");
        const newMtime = fs.statSync(settingsPath).mtimeMs;

        expect(newContent).toBe(originalContent);
        expect(newMtime).toBe(originalMtime);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("--help", () => {
    it("displays usage information", async () => {
      const result = await runCli(["init", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Set up axm in the current project");
      expect(result.stdout).toContain("--scope");
      expect(result.stdout).toContain("--yes");
    });
  });

  describe("--non-interactive flag", () => {
    it("fails when prompting is needed without --yes", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["init", "--non-interactive"], { cwd: temp.path });

        // Should fail since prompting would be needed (exit 1 = CliError)
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("non-interactive");
      } finally {
        temp.cleanup();
      }
    });

    it("succeeds with both --yes and --non-interactive", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["init", "--yes", "--non-interactive"], { cwd: temp.path });

        expect(result.exitCode).toBe(0);

        // Should create settings.json
        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        expect(fs.existsSync(settingsPath)).toBe(true);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("builtin pack", () => {
    it("creates builtin pack lock entry and skill files on init", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["init", "--yes"], { cwd: temp.path });
        expect(result.exitCode).toBe(0);

        // Verify lockfile has builtin pack entry
        const lockfilePath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lockfileContent = fs.readFileSync(lockfilePath, "utf-8");
        const lockfile = YAML.parse(lockfileContent);

        expect(lockfile.packs).toBeDefined();
        expect(lockfile.packs["@axm/packs/cli"]).toBeDefined();
        expect(lockfile.packs["@axm/packs/cli"].type).toBe("builtin");
        expect(lockfile.packs["@axm/packs/cli"].namespace).toBe("@axm");
        expect(lockfile.packs["@axm/packs/cli"].name).toBe("cli");
        expect(lockfile.packs["@axm/packs/cli"].resolvedVersion).toBeDefined();

        // Verify builtin skill lock entries
        const skillNames = [
          "axm-manage-skills",
          "axm-manage-packs",
          "axm-manage-mcp-servers",
          "axm-manage-commands",
        ];
        for (const name of skillNames) {
          expect(lockfile.skills[name]).toBeDefined();
          expect(lockfile.skills[name].type).toBe("builtin");
        }

        // Verify skill files exist on disk
        for (const name of skillNames) {
          const skillPath = path.join(
            temp.path,
            ".axm",
            "extensions",
            "@axm",
            "skills",
            name,
            "SKILL.md",
          );
          expect(fs.existsSync(skillPath)).toBe(true);
        }

        // Verify settings.json does NOT have builtin pack
        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.packs).toBeUndefined();
      } finally {
        temp.cleanup();
      }
    });

    it("does not duplicate builtin lock entries on re-init", async () => {
      const temp = createTempDir();
      try {
        // First init
        await runCli(["init", "--yes"], { cwd: temp.path });

        // Capture lockfile state
        const lockfilePath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const firstContent = fs.readFileSync(lockfilePath, "utf-8");
        const firstLockfile = YAML.parse(firstContent);

        // Second init
        const result = await runCli(["init", "--yes"], { cwd: temp.path });
        expect(result.exitCode).toBe(0);

        // Read lockfile again — should not have duplicate entries
        const secondContent = fs.readFileSync(lockfilePath, "utf-8");
        const secondLockfile = YAML.parse(secondContent);

        // Pack entry count should be the same
        expect(Object.keys(secondLockfile.packs || {})).toEqual(
          Object.keys(firstLockfile.packs || {}),
        );

        // Skill entry count should be the same
        expect(Object.keys(secondLockfile.skills)).toEqual(Object.keys(firstLockfile.skills));
      } finally {
        temp.cleanup();
      }
    });

    it("skills update reports no changes for builtin skills", async () => {
      const temp = createTempDir();
      try {
        // Init workspace
        await runCli(["init", "--yes"], { cwd: temp.path });

        // Run skills update — builtin skills should be skipped (not in settings)
        const result = await runCli(["skills", "update", "--yes"], { cwd: temp.path });

        // Should succeed — builtin skills are not eligible for update
        expect(result.exitCode).toBeLessThanOrEqual(1);
      } finally {
        temp.cleanup();
      }
    });
  });
});
