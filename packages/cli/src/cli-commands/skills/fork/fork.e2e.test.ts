/**
 * E2E tests for `axm skills fork`.
 *
 * Task 17.2: Fork from an installed skill — install locally, fork to local
 * registry, verify managed extension in `.axm/extensions/`, verify published
 * in registry, verify lockfile updated with registry source.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";

describe("axm skills fork", () => {
  describe("fork from installed skill", () => {
    it("forks an installed skill to a managed extension and publishes to registry", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        // Initialize workspace
        await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });

        // Set up registry source and scope in settings
        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        settings.sources = [
          { name: "local", source: "registry", url: `file://${registryDir.path}` },
        ];
        settings.scope = "@test";
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        // Install a skill from local source
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

        // Fork the installed skill
        const forkResult = await runCli(["skills", "fork", "my-skill", "--yes"], {
          cwd: temp.path,
        });
        expect(forkResult.exitCode).toBe(0);

        // 1. Verify managed extension in .axm/extensions/
        const extensionDir = path.join(
          temp.path,
          ".axm",
          "extensions",
          "@test",
          "skills",
          "my-skill",
        );
        expect(fs.existsSync(extensionDir)).toBe(true);
        // Content files should be in src/ subdirectory
        expect(fs.existsSync(path.join(extensionDir, "src", "SKILL.md"))).toBe(true);

        // Verify axm-skill.json manifest was generated at extension root (not inside src/)
        const manifestPath = path.join(extensionDir, "axm-skill.json");
        expect(fs.existsSync(manifestPath)).toBe(true);
        expect(fs.existsSync(path.join(extensionDir, "src", "axm-skill.json"))).toBe(false);
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        expect(manifest.name).toBe("@test/my-skill");
        expect(manifest.version).toBe("0.1.0");
        expect(manifest).not.toHaveProperty("agents");

        // 2. Verify published in registry
        const registryExtDir = path.join(
          registryDir.path,
          "extensions",
          "@test",
          "skills",
          "my-skill",
        );
        expect(fs.existsSync(registryExtDir)).toBe(true);

        // Verify index.json
        const indexPath = path.join(registryExtDir, "index.json");
        expect(fs.existsSync(indexPath)).toBe(true);
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        expect(index.name).toBe("my-skill");
        expect(index.scope).toBe("@test");
        expect(index.versions.length).toBeGreaterThan(0);
        expect(index.versions[0].version).toBe("0.1.0");
        expect(index.versions[0].checksum).toMatch(/^sha256:/);

        // Verify archive
        const archivePath = path.join(registryExtDir, "0.1.0.zip");
        expect(fs.existsSync(archivePath)).toBe(true);

        // 3. Verify lockfile was updated with registry source
        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        expect(lock.skills["my-skill"]).toBeDefined();
        expect(lock.skills["my-skill"].source).toBe("registry");
        expect(lock.skills["my-skill"].scope).toBe("@test");

        // 4. Verify settings.json was updated with forked skill
        const settingsAfterFork = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settingsAfterFork.skills).toBeDefined();
        expect(settingsAfterFork.skills["my-skill"]).toBe("registry");
      } finally {
        temp.cleanup();
        registryDir.cleanup();
      }
    });

    it("forks multiple skills via glob pattern", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });

        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        settings.sources = [
          { name: "local", source: "registry", url: `file://${registryDir.path}` },
        ];
        settings.scope = "@test";
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        // Install all skills from fixture
        const installResult = await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes", "--agent", "claude-code"],
          { cwd: temp.path },
        );
        expect(installResult.exitCode).toBe(0);

        // Fork all skills matching glob via --skill filter
        const forkResult = await runCli(
          ["skills", "fork", SKILLS_REPO_FIXTURE, "--skill", "*-skill", "--yes"],
          { cwd: temp.path },
        );
        expect(forkResult.exitCode).toBe(0);

        // Verify both skills were forked
        for (const skillName of ["my-skill", "another-skill"]) {
          const extensionDir = path.join(
            temp.path,
            ".axm",
            "extensions",
            "@test",
            "skills",
            skillName,
          );
          expect(fs.existsSync(extensionDir)).toBe(true);
          expect(fs.existsSync(path.join(extensionDir, "axm-skill.json"))).toBe(true);

          // Verify published in registry
          const registryIndexPath = path.join(
            registryDir.path,
            "extensions",
            "@test",
            "skills",
            skillName,
            "index.json",
          );
          expect(fs.existsSync(registryIndexPath)).toBe(true);
        }
      } finally {
        temp.cleanup();
        registryDir.cleanup();
      }
    });
  });

  describe("fork from local source", () => {
    it("forks a skill directly from a local source directory", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });

        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        settings.sources = [
          { name: "local", source: "registry", url: `file://${registryDir.path}` },
        ];
        settings.scope = "@test";
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        // Fork directly from local source (not an installed skill)
        const forkResult = await runCli(["skills", "fork", SKILLS_REPO_FIXTURE, "--yes"], {
          cwd: temp.path,
        });
        expect(forkResult.exitCode).toBe(0);

        // Verify at least one skill was forked
        const extensionsDir = path.join(temp.path, ".axm", "extensions", "@test", "skills");
        expect(fs.existsSync(extensionsDir)).toBe(true);
        const forkedSkills = fs.readdirSync(extensionsDir);
        expect(forkedSkills.length).toBeGreaterThan(0);
      } finally {
        temp.cleanup();
        registryDir.cleanup();
      }
    });
  });

  describe("--help", () => {
    it("displays usage information", async () => {
      const result = await runCli(["skills", "fork", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("skills fork");
      expect(result.stdout).toContain("--yes");
      expect(result.stdout).toContain("--preview");
    });
  });
});
