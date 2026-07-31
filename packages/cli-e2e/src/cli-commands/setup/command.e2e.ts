/**
 * E2E tests for the `axm setup` command.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "../../e2e/utils.js";

describe("axm setup", () => {
  describe("with --yes and --non-interactive", () => {
    it("creates settings file in .axm directory", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });

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
        expect(settings.skills?.["axm"]).toBe("workspace:@agentxm/skills/axm");
        expect(
          fs.existsSync(
            path.join(axmDir, "extensions", "@agentxm", "skills", "axm", "src", "SKILL.md"),
          ),
        ).toBe(true);
      } finally {
        temp.cleanup();
      }
    });

    it("supports an offline sync preview immediately after setup", async () => {
      const temp = createTempDir();
      try {
        const setup = await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
          env: { AXM_REGISTRY_URL: "http://127.0.0.1:1" },
        });
        expect(setup.exitCode, `${setup.stderr}\n${setup.stdout}`).toBe(0);
        fs.rmSync(path.join(temp.path, ".agents", "skills", "axm"), {
          recursive: true,
          force: true,
        });

        const preview = await runCli(["sync", "--dry-run", "--json"], {
          cwd: temp.path,
          env: { AXM_REGISTRY_URL: "http://127.0.0.1:1" },
        });
        expect(preview.exitCode, `${preview.stderr}\n${preview.stdout}`).toBe(0);
        expect(preview.stdout).toContain("workspace:@agentxm/skills/axm");
      } finally {
        temp.cleanup();
      }
    });

    it("reports authored workspace changes as one successful advisory JSON result", async () => {
      const temp = createTempDir();
      try {
        const env = { HOME: temp.path, AXM_USER_HOME: temp.path };
        const setup = await runCli(
          ["setup", "--agent", "claude-code", "--yes", "--non-interactive"],
          {
            cwd: temp.path,
            env,
          },
        );
        expect(setup.exitCode, `${setup.stderr}\n${setup.stdout}`).toBe(0);
        const bundledSkillPath = path.join(
          temp.path,
          ".axm",
          "extensions",
          "@agentxm",
          "skills",
          "axm",
          "src",
          "SKILL.md",
        );
        fs.appendFileSync(bundledSkillPath, "\nLocal drift\n");

        const status = await runCli(["status", "--json"], { cwd: temp.path, env });

        expect(status.exitCode, `${status.stderr}\n${status.stdout}`).toBe(0);
        const result = JSON.parse(status.stdout);
        expect(result).toMatchObject({
          ok: true,
          result: {
            healthy: false,
            desiredGraphComplete: true,
            blockedOperations: [],
          },
        });
        expect(result.result.problems).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              identity: "@agentxm/skills/axm",
              blocking: false,
              recoveryAction: "axm publish @agentxm/skills/axm",
            }),
          ]),
        );
      } finally {
        temp.cleanup();
      }
    });

    it("creates settings.json with detected agents", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });

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
        const result = await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });

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
        const result = await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });

        expect(result.exitCode).toBe(0);
        // Should indicate initialization occurred
        expect(result.stdout + result.stderr).toContain("setup");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("on initialized workspace", () => {
    it("succeeds when running setup again", async () => {
      const temp = createTempDir();
      try {
        // First setup
        await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });

        // Second setup should succeed
        const result = await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });

        expect(result.exitCode).toBe(0);
      } finally {
        temp.cleanup();
      }
    });

    it("does not modify settings when already initialized", async () => {
      const temp = createTempDir();
      try {
        // First setup
        await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });

        // Get original settings
        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const originalContent = fs.readFileSync(settingsPath, "utf-8");
        const originalMtime = fs.statSync(settingsPath).mtimeMs;

        // Wait a bit to ensure mtime would change if file is written
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Second setup
        await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });

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
      const result = await runCli(["setup", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Set up AXM in the current project");
      expect(result.stdout).toContain("--scope");
      expect(result.stdout).toContain("--yes");
    });
  });

  describe("--non-interactive flag", () => {
    it("auto-selects detected agents without prompting", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["setup", "--non-interactive"], { cwd: temp.path });

        // Should succeed — non-interactive auto-selects all detected agents
        expect(result.exitCode).toBe(0);

        // Should create settings.json with agents
        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        expect(fs.existsSync(settingsPath)).toBe(true);
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings).toHaveProperty("agents");
        expect(Array.isArray(settings.agents)).toBe(true);
      } finally {
        temp.cleanup();
      }
    });

    it("succeeds with both --yes and --non-interactive", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });

        expect(result.exitCode).toBe(0);

        // Should create settings.json
        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        expect(fs.existsSync(settingsPath)).toBe(true);
      } finally {
        temp.cleanup();
      }
    });
  });
});
