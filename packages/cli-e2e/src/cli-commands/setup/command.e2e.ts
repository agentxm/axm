/**
 * E2E tests for the `axm setup` command.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "../../e2e/utils.js";

const approvedProjectSetup = [
  "setup",
  "--yes",
  "--scope",
  "project",
  "--agent",
  "claude-code",
  "--non-interactive",
] as const;

describe("axm setup", () => {
  describe("with --yes and --non-interactive", () => {
    it("creates the project contract at the workspace root", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(approvedProjectSetup, { cwd: temp.path });

        // Should exit successfully
        expect(result.exitCode).toBe(0);

        const settingsPath = path.join(temp.path, "axm.json");
        expect(fs.existsSync(settingsPath)).toBe(true);

        // Settings should be valid JSON with required properties
        const settingsContent = fs.readFileSync(settingsPath, "utf-8");
        const settings = JSON.parse(settingsContent);
        expect(settings).toHaveProperty("agents");
        expect(settings.skills?.["axm"]).toEqual({
          source: "workspace",
          origin: "bundled",
        });
        expect(
          fs.existsSync(
            path.join(
              temp.path,
              "agent_extensions",
              "@agentxm",
              "skills",
              "axm",
              "src",
              "SKILL.md",
            ),
          ),
        ).toBe(true);
      } finally {
        temp.cleanup();
      }
    });

    it("supports an offline sync preview immediately after setup", async () => {
      const temp = createTempDir();
      try {
        const setup = await runCli(approvedProjectSetup, {
          cwd: temp.path,
          env: { AXM_REGISTRY_URL: "http://127.0.0.1:1" },
        });
        expect(setup.exitCode, `${setup.stderr}\n${setup.stdout}`).toBe(0);
        fs.rmSync(path.join(temp.path, ".claude", "skills", "axm"), {
          recursive: true,
          force: true,
        });

        const preview = await runCli(["sync", "--preview", "--json"], {
          cwd: temp.path,
          env: { AXM_REGISTRY_URL: "http://127.0.0.1:1" },
        });
        expect(preview.exitCode, `${preview.stderr}\n${preview.stdout}`).toBe(0);
        expect(JSON.parse(preview.stdout)).toMatchObject({
          result: { units: [expect.objectContaining({ id: "skill:axm", state: "ready" })] },
        });
      } finally {
        temp.cleanup();
      }
    });

    it("reports authored workspace changes as one successful advisory JSON result", async () => {
      const temp = createTempDir();
      try {
        const env = { HOME: temp.path, AXM_USER_HOME: temp.path };
        const setup = await runCli(approvedProjectSetup, {
          cwd: temp.path,
          env,
        });
        expect(setup.exitCode, `${setup.stderr}\n${setup.stdout}`).toBe(0);
        const bundledSkillPath = path.join(
          temp.path,
          "agent_extensions",
          "@agentxm",
          "skills",
          "axm",
          "src",
          "SKILL.md",
        );
        fs.appendFileSync(bundledSkillPath, "\nLocal drift\n");

        const lint = await runCli(["lint", "--json"], { cwd: temp.path, env });
        expect(lint.exitCode, `${lint.stderr}\n${lint.stdout}`).toBe(0);
      } finally {
        temp.cleanup();
      }
    });

    it("creates settings.json with detected agents", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(approvedProjectSetup, { cwd: temp.path });

        expect(result.exitCode).toBe(0);

        // Verify settings.json structure
        const settingsPath = path.join(temp.path, "axm.json");
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
        const result = await runCli(approvedProjectSetup, { cwd: temp.path });

        expect(result.exitCode).toBe(0);

        // Should create axm-lock.yaml
        const lockfilePath = path.join(temp.path, "axm-lock.yaml");
        expect(fs.existsSync(lockfilePath)).toBe(true);
      } finally {
        temp.cleanup();
      }
    });

    it("outputs initialization message", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(approvedProjectSetup, { cwd: temp.path });

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
        await runCli(approvedProjectSetup, { cwd: temp.path });

        // Second setup should succeed
        const result = await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
      } finally {
        temp.cleanup();
      }
    });

    it("does not modify settings when already initialized", async () => {
      const temp = createTempDir();
      try {
        // First setup
        await runCli(approvedProjectSetup, { cwd: temp.path });

        // Get original settings
        const settingsPath = path.join(temp.path, "axm.json");
        const originalContent = fs.readFileSync(settingsPath, "utf-8");
        const originalMtime = fs.statSync(settingsPath).mtimeMs;

        // Wait a bit to ensure mtime would change if file is written
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Second setup
        await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          { cwd: temp.path },
        );

        // Settings should not be modified
        const newContent = fs.readFileSync(settingsPath, "utf-8");
        const newMtime = fs.statSync(settingsPath).mtimeMs;

        expect(newContent).toBe(originalContent);
        expect(newMtime).toBe(originalMtime);
      } finally {
        temp.cleanup();
      }
    });

    it("does not change membership when rerun with a different explicit agent", async () => {
      const temp = createTempDir();
      try {
        const first = await runCli(approvedProjectSetup, { cwd: temp.path });
        expect(first.exitCode, `${first.stderr}\n${first.stdout}`).toBe(0);
        const settingsPath = path.join(temp.path, "axm.json");
        const before = fs.readFileSync(settingsPath);

        const second = await runCli(
          ["setup", "--scope", "project", "--agent", "cursor", "--yes", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        expect(second.exitCode, `${second.stderr}\n${second.stdout}`).toBe(0);
        expect(fs.readFileSync(settingsPath)).toEqual(before);
        expect(second.stdout + second.stderr).toContain("axm agents add");
        expect(second.stdout + second.stderr).toContain("axm agents remove");
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
      expect(result.stdout).not.toContain("--force");
    });
  });

  describe("--non-interactive flag", () => {
    it("requires approval, explicit scope, and agents before writing", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["setup", "--non-interactive", "--json"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(2);
        expect(JSON.parse(result.stdout)).toMatchObject({
          ok: false,
          result: {
            outcome: "failed",
            reason: "approval-required",
            errorCode: "usage",
            status: "approval-required",
            changed: false,
            scopeSupport: expect.any(Array),
          },
        });
        expect(fs.existsSync(path.join(temp.path, ".axm"))).toBe(false);
      } finally {
        temp.cleanup();
      }
    });

    it("previews a runnable exact candidate without writing", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(
          ["setup", "--preview", "--scope", "project", "--json", "--non-interactive"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        expect(JSON.parse(result.stdout)).toMatchObject({
          ok: true,
          result: {
            outcome: "previewed",
            status: "preview",
            changed: false,
            agents: expect.any(Array),
            agentCandidates: expect.any(Array),
            scopeSupport: expect.arrayContaining([
              expect.objectContaining({
                type: "skill",
                outcomes: expect.any(Array),
              }),
            ]),
            steps: expect.any(Array),
          },
          suggestions: [
            expect.objectContaining({
              description: "Apply setup",
              cmd: expect.stringContaining("axm setup --yes --scope project --agent"),
            }),
          ],
        });
        expect(fs.existsSync(path.join(temp.path, ".axm"))).toBe(false);
      } finally {
        temp.cleanup();
      }
    });
  });
});
