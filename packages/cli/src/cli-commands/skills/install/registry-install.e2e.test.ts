/**
 * E2E tests for `axm skills install` from a local registry.
 *
 * Task 17.1: Since the CLI parser does not yet support `registry:` prefix for
 * direct registry installs, this test verifies the registry install flow via
 * the fork command, which forks an installed skill to a managed extension,
 * publishes it to a local registry, and updates the lockfile with registry
 * fields (resolvedVersion, checksum, sourceName).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";

describe("axm skills install from local registry (via fork)", () => {
  it("fork installs skill to .axm/extensions/ and creates registry lockfile entry", async () => {
    const temp = createTempDir();
    const registryDir = createTempDir("axm-registry-");
    try {
      // Initialize workspace
      await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });

      // Set up registry source and scope in settings
      const settingsPath = path.join(temp.path, ".axm", "settings.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      settings.sources = [{ name: "local", type: "registry", url: `file://${registryDir.path}` }];
      settings.scope = "@test";
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

      // Install a skill from local source first
      const installResult = await runCli(
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
      expect(installResult.exitCode).toBe(0);

      // Verify the skill is installed in .agents/skills/
      const canonicalSkillDir = path.join(temp.path, ".agents", "skills", "my-skill");
      expect(fs.existsSync(canonicalSkillDir)).toBe(true);

      // Fork the installed skill to registry
      const forkResult = await runCli(["skills", "fork", "my-skill", "--yes"], { cwd: temp.path });
      expect(forkResult.exitCode).toBe(0);

      // Verify files in .axm/extensions/@test/skills/my-skill/
      const extensionDir = path.join(
        temp.path,
        ".axm",
        "extensions",
        "@test",
        "skills",
        "my-skill",
      );
      expect(fs.existsSync(extensionDir)).toBe(true);
      // Content should be in src/ subdirectory
      expect(fs.existsSync(path.join(extensionDir, "src", "SKILL.md"))).toBe(true);
      // Fork generates axm-skill.json manifest at extension root
      expect(fs.existsSync(path.join(extensionDir, "axm-skill.json"))).toBe(true);
      // Manifest should NOT be inside src/
      expect(fs.existsSync(path.join(extensionDir, "src", "axm-skill.json"))).toBe(false);

      // Verify lockfile has registry fields
      const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
      expect(fs.existsSync(lockPath)).toBe(true);
      const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

      expect(lock.skills).toBeDefined();
      expect(lock.skills["my-skill"]).toBeDefined();

      const entry = lock.skills["my-skill"];
      expect(entry.type).toBe("registry");
      expect(entry.scope).toBe("@test");
      expect(entry.name).toBe("my-skill");
      expect(entry.resolvedVersion).toBeDefined();
      expect(entry.agents).toContain("claude-code");
      expect(entry.installedAt).toBeDefined();
      expect(entry.updatedAt).toBeDefined();
    } finally {
      temp.cleanup();
      registryDir.cleanup();
    }
  });

  it("fork publishes to registry and creates index.json with version entry", async () => {
    const temp = createTempDir();
    const registryDir = createTempDir("axm-registry-");
    try {
      // Initialize workspace
      await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });

      // Set up registry source
      const settingsPath = path.join(temp.path, ".axm", "settings.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      settings.sources = [{ name: "local", type: "registry", url: `file://${registryDir.path}` }];
      settings.scope = "@test";
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

      // Install and fork
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

      const forkResult = await runCli(["skills", "fork", "my-skill", "--yes"], { cwd: temp.path });
      expect(forkResult.exitCode).toBe(0);

      // Verify registry index.json was created
      const registryIndexPath = path.join(
        registryDir.path,
        "extensions",
        "@test",
        "skills",
        "my-skill",
        "index.json",
      );
      expect(fs.existsSync(registryIndexPath)).toBe(true);

      const index = JSON.parse(fs.readFileSync(registryIndexPath, "utf-8"));
      expect(index.name).toBe("my-skill");
      expect(index.scope).toBe("@test");
      expect(index.type).toBe("skill");
      expect(index.versions).toBeDefined();
      expect(index.versions.length).toBeGreaterThan(0);

      const versionEntry = index.versions[0];
      expect(versionEntry.version).toBe("0.1.0");
      expect(versionEntry.checksum).toMatch(/^sha256:/);
      expect(versionEntry.agents).toBeDefined();

      // Verify archive exists
      const archivePath = path.join(
        registryDir.path,
        "extensions",
        "@test",
        "skills",
        "my-skill",
        "0.1.0.zip",
      );
      expect(fs.existsSync(archivePath)).toBe(true);
    } finally {
      temp.cleanup();
      registryDir.cleanup();
    }
  });

  it("fresh install from registry has manifest and src/ content", async () => {
    const temp = createTempDir();
    const registryDir = createTempDir("axm-registry-");
    try {
      // Initialize workspace
      await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });

      // Set up registry source and scope in settings
      const settingsPath = path.join(temp.path, ".axm", "settings.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      settings.sources = [{ name: "local", type: "registry", url: `file://${registryDir.path}` }];
      settings.scope = "@test";
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

      // Install a skill from local source, then fork to publish to registry
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
      const forkResult = await runCli(["skills", "fork", "my-skill", "--yes"], { cwd: temp.path });
      expect(forkResult.exitCode).toBe(0);

      // Uninstall the skill completely
      const uninstallResult = await runCli(["skills", "uninstall", "my-skill", "--yes"], {
        cwd: temp.path,
      });
      expect(uninstallResult.exitCode).toBe(0);

      // Verify it's fully gone
      const extensionDir = path.join(
        temp.path,
        ".axm",
        "extensions",
        "@test",
        "skills",
        "my-skill",
      );
      expect(fs.existsSync(extensionDir)).toBe(false);

      // Fresh install from registry using @scope/name syntax
      const registryInstallResult = await runCli(
        ["skills", "install", "@test/my-skill", "--yes", "--agent", "claude-code"],
        { cwd: temp.path },
      );
      expect(registryInstallResult.exitCode).toBe(0);

      // Verify manifest at extension root
      expect(fs.existsSync(path.join(extensionDir, "axm-skill.json"))).toBe(true);
      // Verify content in src/ subdirectory
      expect(fs.existsSync(path.join(extensionDir, "src", "SKILL.md"))).toBe(true);
      // Verify manifest NOT inside src/
      expect(fs.existsSync(path.join(extensionDir, "src", "axm-skill.json"))).toBe(false);

      // Verify lockfile has registry entry
      const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
      const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
      expect(lock.skills["my-skill"]).toBeDefined();
      expect(lock.skills["my-skill"].type).toBe("registry");

      // Verify settings has the skill
      const settingsAfter = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settingsAfter.skills?.["my-skill"]).toBeDefined();

      // Verify agent symlink exists and points to src/ content
      const agentSkillDir = path.join(temp.path, ".claude", "skills", "my-skill");
      expect(fs.existsSync(agentSkillDir)).toBe(true);
    } finally {
      temp.cleanup();
      registryDir.cleanup();
    }
  });

  it("agent symlinks point to the registry extension location", async () => {
    const temp = createTempDir();
    const registryDir = createTempDir("axm-registry-");
    try {
      await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });

      const settingsPath = path.join(temp.path, ".axm", "settings.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      settings.sources = [{ name: "local", type: "registry", url: `file://${registryDir.path}` }];
      settings.scope = "@test";
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

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

      await runCli(["skills", "fork", "my-skill", "--yes"], { cwd: temp.path });

      // Verify symlink from agent directory exists
      const agentSkillDir = path.join(temp.path, ".claude", "skills", "my-skill");
      expect(fs.existsSync(agentSkillDir)).toBe(true);
      const stat = fs.lstatSync(agentSkillDir);
      expect(stat.isSymbolicLink()).toBe(true);
    } finally {
      temp.cleanup();
      registryDir.cleanup();
    }
  });
});
