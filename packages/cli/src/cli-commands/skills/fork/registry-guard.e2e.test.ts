/**
 * E2E tests for registry guard behavior.
 *
 * Task 17.5: Verify that commands requiring a registry (fork, publish)
 * fail with a descriptive error in non-interactive mode when no registry
 * is configured.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";

describe("registry guard", () => {
  describe("fork command without registry configured", () => {
    it("fails in non-interactive mode when no registry source exists", async () => {
      const temp = createTempDir();
      try {
        // Initialize workspace without registry source
        await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });

        // Install a skill first (so fork has something to work with)
        await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--yes",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        // Attempt to fork with --non-interactive (no registry configured)
        const forkResult = await runCli(
          ["skills", "fork", "my-skill", "--yes", "--non-interactive"],
          { cwd: temp.path },
        );

        // Should fail because no registry is configured
        expect(forkResult.exitCode).not.toBe(0);
        expect(forkResult.stderr).toContain("registry");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("publish command without registry configured", () => {
    it("fails in non-interactive mode when no registry source exists", async () => {
      const temp = createTempDir();
      try {
        // Initialize workspace without registry source
        await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });

        // Create a fake managed extension so publish has something to find
        const extensionDir = path.join(
          temp.path,
          ".axm",
          "extensions",
          "@test",
          "skills",
          "my-skill",
        );
        fs.mkdirSync(extensionDir, { recursive: true });
        fs.writeFileSync(
          path.join(extensionDir, "SKILL.md"),
          '---\nname: "my-skill"\n---\n\n# My Skill\n',
        );
        fs.writeFileSync(
          path.join(extensionDir, "axm-skill.json"),
          JSON.stringify(
            {
              name: "@test/my-skill",
              version: "1.0.0",
              agents: ["claude-code"],
            },
            null,
            2,
          ) + "\n",
        );

        // Set scope but no sources
        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        settings.scope = "@test";
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        // Attempt to publish with --non-interactive (no registry configured)
        const publishResult = await runCli(
          ["skills", "publish", "@test/my-skill", "--yes", "--non-interactive"],
          { cwd: temp.path },
        );

        // Should fail because no registry is configured
        expect(publishResult.exitCode).not.toBe(0);
        expect(publishResult.stderr).toContain("registry");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("commands succeed when registry is configured", () => {
    it("fork succeeds when registry source is present in settings", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });

        // Configure registry source
        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        settings.sources = [
          { name: "local", source: "registry", url: `file://${registryDir.path}` },
        ];
        settings.scope = "@test";
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        // Install a skill
        await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--yes",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        // Fork should succeed with registry configured
        const forkResult = await runCli(["skills", "fork", "my-skill", "--yes"], {
          cwd: temp.path,
        });
        expect(forkResult.exitCode).toBe(0);
      } finally {
        temp.cleanup();
        registryDir.cleanup();
      }
    });
  });
});
