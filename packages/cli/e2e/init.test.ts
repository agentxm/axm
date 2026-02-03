/**
 * E2E tests for the `axm init` command.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "./utils.js";

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
        expect(settings).toHaveProperty("scope");
      } finally {
        temp.cleanup();
      }
    });

    it("creates settings.json with detected agents and @community scope", async () => {
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

        // Should have @community scope (default)
        expect(settings).toHaveProperty("scope");
        expect(settings.scope).toBe("@community");
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
    it("shows already set up message when running init again", async () => {
      const temp = createTempDir();
      try {
        // First init
        await runCli(["init", "--yes"], { cwd: temp.path });

        // Second init should indicate already initialized
        const result = await runCli(["init", "--yes"], { cwd: temp.path });

        expect(result.exitCode).toBe(0);
        // Per spec: shows message indicating workspace is already set up
        expect(result.stdout).toMatch(/already initialized|nothing to do/i);
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

  describe("with --force flag", () => {
    it("re-initializes workspace when using --force --yes", async () => {
      const temp = createTempDir();
      try {
        // First init with specific agent
        await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });

        // Verify initial settings
        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const initialSettings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(initialSettings.agents).toContain("claude-code");

        // Get original mtime
        const originalMtime = fs.statSync(settingsPath).mtimeMs;

        // Wait a bit to ensure mtime would change
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Re-init with --force and different agent
        const result = await runCli(["init", "--force", "--yes", "--agent", "cursor"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);

        // Settings should be updated with new agent
        const newSettings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(newSettings.agents).toContain("cursor");

        // File should have been modified
        const newMtime = fs.statSync(settingsPath).mtimeMs;
        expect(newMtime).toBeGreaterThan(originalMtime);
      } finally {
        temp.cleanup();
      }
    });

    it("overwrites settings.json when using --force", async () => {
      const temp = createTempDir();
      try {
        // First init
        await runCli(["init", "--yes"], { cwd: temp.path });

        // Manually modify settings
        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        settings.customField = "test-value";
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        // Re-init with --force
        const result = await runCli(["init", "--force", "--yes"], { cwd: temp.path });

        expect(result.exitCode).toBe(0);

        // Settings should be overwritten (custom field should be gone)
        const newSettings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(newSettings.customField).toBeUndefined();
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("with --dry-run flag", () => {
    it("shows plan without creating files", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["init", "--dry-run", "--yes"], { cwd: temp.path });

        expect(result.exitCode).toBe(0);

        // Should show dry-run message
        expect(result.stdout).toContain("Dry-run complete. No changes made.");

        // Should show plan info (agents that would be configured)
        expect(result.stdout).toContain("Plan:");

        // Should NOT create .axm directory
        const axmDir = path.join(temp.path, ".axm");
        expect(fs.existsSync(axmDir)).toBe(false);
      } finally {
        temp.cleanup();
      }
    });

    it("shows agents that would be configured", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["init", "--dry-run", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);

        // Should show the agent in the plan
        expect(result.stdout).toContain("claude-code");

        // Should NOT create any files
        const axmDir = path.join(temp.path, ".axm");
        expect(fs.existsSync(axmDir)).toBe(false);
      } finally {
        temp.cleanup();
      }
    });

    it("shows no changes when workspace already initialized", async () => {
      const temp = createTempDir();
      try {
        // First, initialize the workspace
        await runCli(["init", "--yes"], { cwd: temp.path });

        // Run dry-run on initialized workspace
        const result = await runCli(["init", "--dry-run", "--yes"], { cwd: temp.path });

        expect(result.exitCode).toBe(0);

        // Should indicate no changes (already initialized)
        expect(result.stdout).toMatch(/already initialized|no changes|unchanged/i);
      } finally {
        temp.cleanup();
      }
    });

    it("shows changes when using --dry-run --force on initialized workspace", async () => {
      const temp = createTempDir();
      try {
        // First, initialize with one agent
        await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });

        // Run dry-run with --force and different agent
        const result = await runCli(
          ["init", "--dry-run", "--force", "--yes", "--agent", "cursor"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);

        // Should show the plan with changes
        expect(result.stdout).toContain("Plan:");
        expect(result.stdout).toContain("Dry-run complete. No changes made.");

        // Settings should not be modified (dry-run)
        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings.agents).toContain("claude-code");
        expect(settings.agents).not.toContain("cursor");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("--help", () => {
    it("displays usage information", async () => {
      const result = await runCli(["init", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Initialize axm");
      expect(result.stdout).toContain("--global");
      expect(result.stdout).toContain("--agent");
      expect(result.stdout).toContain("--yes");
      expect(result.stdout).toContain("--force");
      expect(result.stdout).toContain("--dry-run");
    });
  });
});
