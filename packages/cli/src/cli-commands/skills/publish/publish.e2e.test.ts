/**
 * E2E tests for `axm skills publish`.
 *
 * Task 17.3: Set up a managed extension, publish to a local registry, verify
 * archive and index.json in registry.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "../../../e2e/utils.js";

describe("axm skills publish", () => {
  describe("publish to local registry", () => {
    it("publishes a managed extension and creates archive + index.json in registry", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        // Initialize workspace
        await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });

        // Set up registry source and scope
        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        settings.sources = [
          { name: "local", type: "registry", location: `file://${registryDir.path}` },
        ];
        settings.scope = "@test";
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        // Manually create a managed extension in .axm/extensions/
        const extensionDir = path.join(
          temp.path,
          ".axm",
          "extensions",
          "@test",
          "skills",
          "my-publish-skill",
        );
        const srcDir = path.join(extensionDir, "src");
        fs.mkdirSync(srcDir, { recursive: true });

        // Create SKILL.md in src/ subdirectory
        fs.writeFileSync(
          path.join(srcDir, "SKILL.md"),
          '---\nname: "my-publish-skill"\ndescription: "A test skill"\n---\n\n# My Publish Skill\n',
        );

        // Create axm-skill.json manifest at extension root
        const manifest = {
          name: "@test/my-publish-skill",
          version: "1.0.0",
          agents: ["claude-code"],
          dependencies: {},
        };
        fs.writeFileSync(
          path.join(extensionDir, "axm-skill.json"),
          JSON.stringify(manifest, null, 2) + "\n",
        );

        // Publish the extension
        const publishResult = await runCli(
          ["skills", "publish", "@test/my-publish-skill", "--yes"],
          { cwd: temp.path },
        );
        expect(publishResult.exitCode).toBe(0);

        // Verify index.json in registry
        const registryIndexPath = path.join(
          registryDir.path,
          "extensions",
          "@test",
          "skills",
          "my-publish-skill",
          "index.json",
        );
        expect(fs.existsSync(registryIndexPath)).toBe(true);

        const index = JSON.parse(fs.readFileSync(registryIndexPath, "utf-8"));
        expect(index.name).toBe("my-publish-skill");
        expect(index.scope).toBe("@test");
        expect(index.type).toBe("skill");
        expect(index.versions).toBeDefined();
        expect(index.versions.length).toBe(1);

        const versionEntry = index.versions[0];
        expect(versionEntry.version).toBe("1.0.0");
        expect(versionEntry.integrity).toMatch(/^sha512-[A-Za-z0-9+/]+=*$/);
        expect(versionEntry.published).toBeDefined();

        // Verify archive in registry
        const archivePath = path.join(
          registryDir.path,
          "extensions",
          "@test",
          "skills",
          "my-publish-skill",
          "1.0.0.zip",
        );
        expect(fs.existsSync(archivePath)).toBe(true);

        // Verify archive is a valid zip
        const archiveBytes = fs.readFileSync(archivePath);
        expect(archiveBytes.length).toBeGreaterThan(0);
        // ZIP magic bytes: PK (0x50 0x4b)
        expect(archiveBytes[0]).toBe(0x50);
        expect(archiveBytes[1]).toBe(0x4b);
      } finally {
        temp.cleanup();
        registryDir.cleanup();
      }
    });

    it("publishes with bare name (resolves scope from settings)", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });

        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        settings.sources = [
          { name: "local", type: "registry", location: `file://${registryDir.path}` },
        ];
        settings.scope = "@myorg";
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        // Create managed extension with scope from settings
        const extensionDir = path.join(
          temp.path,
          ".axm",
          "extensions",
          "@myorg",
          "skills",
          "code-review",
        );
        const srcDir = path.join(extensionDir, "src");
        fs.mkdirSync(srcDir, { recursive: true });
        fs.writeFileSync(
          path.join(srcDir, "SKILL.md"),
          '---\nname: "code-review"\n---\n\n# Code Review\n',
        );
        fs.writeFileSync(
          path.join(extensionDir, "axm-skill.json"),
          JSON.stringify(
            {
              name: "@myorg/code-review",
              version: "2.0.0",
              agents: ["claude-code"],
              dependencies: {},
            },
            null,
            2,
          ) + "\n",
        );

        // Publish using bare name (scope resolved from settings)
        const publishResult = await runCli(["skills", "publish", "code-review", "--yes"], {
          cwd: temp.path,
        });
        expect(publishResult.exitCode).toBe(0);

        // Verify registry entry
        const registryIndexPath = path.join(
          registryDir.path,
          "extensions",
          "@myorg",
          "skills",
          "code-review",
          "index.json",
        );
        expect(fs.existsSync(registryIndexPath)).toBe(true);

        const index = JSON.parse(fs.readFileSync(registryIndexPath, "utf-8"));
        expect(index.versions[0].version).toBe("2.0.0");
      } finally {
        temp.cleanup();
        registryDir.cleanup();
      }
    });

    it("fails when managed extension does not exist", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });

        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        settings.sources = [
          { name: "local", type: "registry", location: `file://${registryDir.path}` },
        ];
        settings.scope = "@test";
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        const publishResult = await runCli(
          ["skills", "publish", "@test/nonexistent-skill", "--yes"],
          { cwd: temp.path },
        );
        expect(publishResult.exitCode).not.toBe(0);
        expect(publishResult.stderr).toContain("not found");
      } finally {
        temp.cleanup();
        registryDir.cleanup();
      }
    });
  });

  describe("--help", () => {
    it("displays usage information", async () => {
      const result = await runCli(["skills", "publish", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("skills publish");
      expect(result.stdout).toContain("--yes");
      expect(result.stdout).toContain("--registry");
      expect(result.stdout).toContain("--preview");
    });
  });
});
