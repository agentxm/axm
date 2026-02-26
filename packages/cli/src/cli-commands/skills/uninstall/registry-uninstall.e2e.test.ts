/**
 * E2E tests for `axm skills uninstall` of a registry-sourced skill.
 *
 * Task 17.4: Install from registry (via fork), uninstall, verify cleanup
 * from `.axm/extensions/`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";

describe("axm skills uninstall (registry-sourced)", () => {
  it("uninstalls a registry-sourced skill and cleans up .axm/extensions/", async () => {
    const temp = createTempDir();
    const registryDir = createTempDir("axm-registry-");
    try {
      // Initialize workspace with claude-code agent
      await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });

      // Set up registry source and namespace
      const settingsPath = path.join(temp.path, ".axm", "settings.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      settings.sources = [
        { name: "local", type: "registry", location: `file://${registryDir.path}` },
      ];
      settings.namespace = "@test";
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

      // Install from local source
      await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
        cwd: temp.path,
      });

      // Fork to registry (creates registry-sourced lockfile entry)
      const forkResult = await runCli(["skills", "fork", "my-skill", "--yes"], { cwd: temp.path });
      expect(forkResult.exitCode).toBe(0);

      // Verify the skill is installed as registry-sourced
      const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
      let lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
      expect(lock.skills["my-skill"].type).toBe("registry");

      // Verify extension exists
      const extensionDir = path.join(
        temp.path,
        ".axm",
        "extensions",
        "@test",
        "skills",
        "my-skill",
      );
      expect(fs.existsSync(extensionDir)).toBe(true);

      // Uninstall the skill
      const uninstallResult = await runCli(["skills", "uninstall", "my-skill", "--yes"], {
        cwd: temp.path,
      });
      expect(uninstallResult.exitCode).toBe(0);

      // Verify cleanup from .axm/extensions/
      expect(fs.existsSync(extensionDir)).toBe(false);

      // Verify lockfile entry removed
      lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
      expect(lock.skills?.["my-skill"]).toBeUndefined();

      // Verify settings.json entry removed
      const settingsAfter = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settingsAfter.skills?.["my-skill"]).toBeUndefined();

      // Verify agent symlink removed
      const agentSkillDir = path.join(temp.path, ".claude", "skills", "my-skill");
      expect(fs.existsSync(agentSkillDir)).toBe(false);
    } finally {
      temp.cleanup();
      registryDir.cleanup();
    }
  });

  it("uninstalls a registry-sourced skill from all agents", async () => {
    const temp = createTempDir();
    const registryDir = createTempDir("axm-registry-");
    try {
      // Initialize workspace
      await runCli(["init", "--yes", "--agent", "claude-code"], {
        cwd: temp.path,
      });

      const settingsPath = path.join(temp.path, ".axm", "settings.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      settings.sources = [
        { name: "local", type: "registry", location: `file://${registryDir.path}` },
      ];
      settings.namespace = "@test";
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

      // Install skill
      await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
        cwd: temp.path,
      });

      // Fork to registry
      await runCli(["skills", "fork", "my-skill", "--yes"], { cwd: temp.path });

      // Verify the skill is installed as registry-sourced
      const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
      let lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
      expect(lock.skills["my-skill"].type).toBe("registry");

      // Uninstall removes from all agents (--agent flag was removed)
      const uninstallResult = await runCli(["skills", "uninstall", "my-skill", "--yes"], {
        cwd: temp.path,
      });
      expect(uninstallResult.exitCode).toBe(0);

      // Extension should be fully removed
      const extensionDir = path.join(
        temp.path,
        ".axm",
        "extensions",
        "@test",
        "skills",
        "my-skill",
      );
      expect(fs.existsSync(extensionDir)).toBe(false);

      // Lockfile entry should be removed
      lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
      expect(lock.skills?.["my-skill"]).toBeUndefined();

      // Agent symlink should be removed
      const claudeSkillDir = path.join(temp.path, ".claude", "skills", "my-skill");
      expect(fs.existsSync(claudeSkillDir)).toBe(false);
    } finally {
      temp.cleanup();
      registryDir.cleanup();
    }
  });
});
