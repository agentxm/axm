/**
 * E2E tests for `axm skills publish`.
 *
 * Task 17.3: Set up an extension, publish to a local registry, verify
 * archive and index.json in registry.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli, withoutLocalGitEnvironment } from "../../../e2e/utils.js";

const git = (root: string, args: ReadonlyArray<string>): void => {
  execFileSync("git", args, {
    cwd: root,
    env: {
      ...withoutLocalGitEnvironment(process.env),
      GIT_TERMINAL_PROMPT: "0",
    },
  });
};

describe("axm skills publish", () => {
  describe("publish to local registry", () => {
    it("publishes an extension and creates archive + index.json in registry", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        // Initialize workspace
        await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          { cwd: temp.path },
        );

        // Set up registry source and owner
        const settingsPath = path.join(temp.path, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        settings.sources = [
          { name: "agentxm", type: "registry", location: `file://${registryDir.path}` },
        ];
        settings.owner = "@test";
        settings.skills = {
          ...settings.skills,
          "my-publish-skill": "workspace",
        };
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        // Manually create an authored package.
        const extensionDir = path.join(temp.path, "skills", "my-publish-skill");
        const srcDir = path.join(extensionDir, "src");
        fs.mkdirSync(srcDir, { recursive: true });

        // Create SKILL.md in src/ subdirectory
        fs.writeFileSync(
          path.join(srcDir, "SKILL.md"),
          '---\nname: "my-publish-skill"\ndescription: "A test skill"\n---\n\n# My Publish Skill\n',
        );

        // Create skill.json manifest at extension root
        const manifest = {
          owner: "@test",
          type: "skill",
          name: "my-publish-skill",
          version: "1.0.0",
        };
        fs.writeFileSync(
          path.join(extensionDir, "skill.json"),
          JSON.stringify(manifest, null, 2) + "\n",
        );

        // Publish the extension
        const publishResult = await runCli(
          ["skills", "publish", "@test/skills/my-publish-skill", "--yes"],
          { cwd: temp.path, env: { AXM_TOKEN: "e2e-test-token", NO_COLOR: "1" } },
        );
        expect(publishResult.exitCode).toBe(0);
        expect(publishResult.stdout).toContain("Published @test/skills/my-publish-skill@1.0.0");
        // Plain mode narrates the operation start and its settlement.
        expect(publishResult.stderr).toContain("Publish extensions");
        expect(publishResult.stderr).toMatch(/Publish extensions\s+\d+(?:\.\d+)?(?:ms|s)/u);
        expect(publishResult.stderr).not.toContain("\u001b");

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
        expect(index.owner).toBe("@test");
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

        const quietResult = await runCli(
          [
            "skills",
            "publish",
            "@test/skills/my-publish-skill",
            "--on-existing",
            "verify",
            "--yes",
            "--quiet",
          ],
          { cwd: temp.path, env: { AXM_TOKEN: "e2e-test-token", NO_COLOR: "1" } },
        );
        expect(quietResult.exitCode).toBe(0);
        expect(quietResult.stdout).toBe("");
        expect(quietResult.stderr).toBe("");
      } finally {
        temp.cleanup();
        registryDir.cleanup();
      }
    });

    it("requires explicit acceptance when the archive differs from Git HEAD", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          { cwd: temp.path },
        );
        const settingsPath = path.join(temp.path, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        settings.sources = [
          { name: "agentxm", type: "registry", location: `file://${registryDir.path}` },
        ];
        settings.owner = "@test";
        settings.skills = { ...settings.skills, "git-source-review": "workspace" };
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        const extensionDir = path.join(temp.path, "skills", "git-source-review");
        fs.mkdirSync(path.join(extensionDir, "src"), { recursive: true });
        fs.writeFileSync(
          path.join(extensionDir, "skill.json"),
          `${JSON.stringify({
            owner: "@test",
            type: "skill",
            name: "git-source-review",
            version: "1.0.0",
          })}\n`,
        );
        const skillPath = path.join(extensionDir, "src", "SKILL.md");
        fs.writeFileSync(
          skillPath,
          '---\nname: "git-source-review"\ndescription: "Review Git source"\n---\n\n# Git source review\n',
        );

        git(temp.path, ["init"]);
        git(temp.path, ["config", "user.email", "test@example.com"]);
        git(temp.path, ["config", "user.name", "Test"]);
        git(temp.path, ["add", "."]);
        git(temp.path, ["commit", "-m", "Initial source"]);
        fs.appendFileSync(skillPath, "\nChanged after commit.\n");

        const blocked = await runCli(
          ["skills", "publish", "@test/skills/git-source-review", "--yes", "--json"],
          { cwd: temp.path, env: { AXM_TOKEN: "e2e-test-token" } },
        );
        expect(blocked.exitCode).not.toBe(0);
        expect(JSON.parse(blocked.stdout).result).toMatchObject({
          execution: {
            riskConditions: [
              {
                level: "override-required",
                requiredFlag: "--accept-warnings",
              },
            ],
            outcomes: [
              {
                status: "blocked",
                reason: "source_state_not_accepted",
                sourceState: {
                  status: "differs-from-head",
                  differences: [{ path: "src/SKILL.md", change: "modified" }],
                },
              },
            ],
          },
        });

        const registryIndexPath = path.join(
          registryDir.path,
          "extensions",
          "@test",
          "skills",
          "git-source-review",
          "index.json",
        );
        expect(fs.existsSync(registryIndexPath)).toBe(false);

        const accepted = await runCli(
          [
            "skills",
            "publish",
            "@test/skills/git-source-review",
            "--yes",
            "--accept-warnings",
            "--json",
          ],
          { cwd: temp.path, env: { AXM_TOKEN: "e2e-test-token" } },
        );
        expect(accepted.exitCode, `${accepted.stderr}\n${accepted.stdout}`).toBe(0);
        expect(fs.existsSync(registryIndexPath)).toBe(true);
      } finally {
        temp.cleanup();
        registryDir.cleanup();
      }
    });

    it("publishes with bare name (resolves owner from settings)", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          { cwd: temp.path },
        );

        const settingsPath = path.join(temp.path, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        settings.sources = [
          { name: "agentxm", type: "registry", location: `file://${registryDir.path}` },
        ];
        settings.owner = "@myorg";
        settings.skills = {
          ...settings.skills,
          "code-review": "workspace",
        };
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        // Create extension with owner from settings
        const extensionDir = path.join(temp.path, "skills", "code-review");
        const srcDir = path.join(extensionDir, "src");
        fs.mkdirSync(srcDir, { recursive: true });
        fs.writeFileSync(
          path.join(srcDir, "SKILL.md"),
          '---\nname: "code-review"\ndescription: "Review code changes"\n---\n\n# Code Review\n',
        );
        fs.writeFileSync(
          path.join(extensionDir, "skill.json"),
          JSON.stringify(
            {
              owner: "@myorg",
              type: "skill",
              name: "code-review",
              version: "2.0.0",
            },
            null,
            2,
          ) + "\n",
        );

        // Publish using bare name (owner resolved from settings)
        const publishResult = await runCli(["skills", "publish", "code-review", "--yes"], {
          cwd: temp.path,
          env: { AXM_TOKEN: "e2e-test-token" },
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

    it("returns a successful empty result when an explicit selector does not exist", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          { cwd: temp.path },
        );

        const settingsPath = path.join(temp.path, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        settings.sources = [
          { name: "agentxm", type: "registry", location: `file://${registryDir.path}` },
        ];
        settings.owner = "@test";
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        const publishResult = await runCli(
          ["skills", "publish", "@test/skills/nonexistent-skill", "--yes", "--json"],
          { cwd: temp.path, env: { AXM_TOKEN: "e2e-test-token" } },
        );
        expect(publishResult.exitCode).toBe(0);
        expect(JSON.parse(publishResult.stdout).result.execution.outcomes).toEqual([]);
        expect(publishResult.stderr).toContain('"type":"progress"');
        expect(publishResult.stderr).toContain('"_tag":"UnitStarted"');
        expect(publishResult.stderr).toContain('"label":"publish registry"');
        expect(publishResult.stderr).toContain('"_tag":"OperationSettled"');
      } finally {
        temp.cleanup();
        registryDir.cleanup();
      }
    });
  });

  describe("glob and multi-extension publish", () => {
    /** Create an authored extension with a manifest. */
    const createManagedExtension = (
      tempPath: string,
      owner: string,
      name: string,
      version = "1.0.0",
    ) => {
      const extensionDir = path.join(tempPath, "skills", name);
      const srcDir = path.join(extensionDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, "SKILL.md"),
        `---\nname: "${name}"\ndescription: "Test skill"\n---\n\n# ${name}\n`,
      );
      fs.writeFileSync(
        path.join(extensionDir, "skill.json"),
        JSON.stringify(
          {
            owner,
            type: "skill",
            name,
            version,
          },
          null,
          2,
        ) + "\n",
      );
    };

    /** Set up workspace with registry source, owner, and optional skills in settings. */
    const setupWorkspace = async (
      tempPath: string,
      registryPath: string,
      owner: string,
      skills?: Record<string, string>,
    ) => {
      await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
        { cwd: tempPath },
      );
      const settingsPath = path.join(tempPath, "axm.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      settings.sources = [
        { name: "agentxm", type: "registry", location: `file://${registryPath}` },
      ];
      settings.owner = owner;
      if (skills) settings.skills = skills;
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    };

    it("glob pattern publishes matching configured skills", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        const owner = "@test";

        // Create 3 extensions
        createManagedExtension(temp.path, owner, "effect-basics");
        createManagedExtension(temp.path, owner, "effect-stream");
        createManagedExtension(temp.path, owner, "commit");

        // Set up workspace with all 3 registered as configured skills
        await setupWorkspace(temp.path, registryDir.path, owner, {
          "effect-basics": "workspace",
          "effect-stream": "workspace",
          commit: "workspace",
        });

        // Publish with glob pattern
        const result = await runCli(["skills", "publish", "effect-*", "--yes"], {
          cwd: temp.path,
          env: { AXM_TOKEN: "e2e-test-token" },
        });
        expect(result.exitCode).toBe(0);

        // Verify both effect-* skills have index.json in registry
        const effectBasicsIndex = path.join(
          registryDir.path,
          "extensions",
          owner,
          "skills",
          "effect-basics",
          "index.json",
        );
        const effectStreamIndex = path.join(
          registryDir.path,
          "extensions",
          owner,
          "skills",
          "effect-stream",
          "index.json",
        );
        expect(fs.existsSync(effectBasicsIndex)).toBe(true);
        expect(fs.existsSync(effectStreamIndex)).toBe(true);

        // Verify commit was NOT published (not matched by glob)
        const commitIndex = path.join(
          registryDir.path,
          "extensions",
          owner,
          "skills",
          "commit",
          "index.json",
        );
        expect(fs.existsSync(commitIndex)).toBe(false);
      } finally {
        temp.cleanup();
        registryDir.cleanup();
      }
    });

    it("multiple literal skills publishes all specified", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        const owner = "@test";

        createManagedExtension(temp.path, owner, "skill-a");
        createManagedExtension(temp.path, owner, "skill-b");

        await setupWorkspace(temp.path, registryDir.path, owner, {
          "skill-a": "workspace",
          "skill-b": "workspace",
        });

        // Publish multiple literal names
        const result = await runCli(["skills", "publish", "skill-a", "skill-b", "--yes"], {
          cwd: temp.path,
          env: { AXM_TOKEN: "e2e-test-token" },
        });
        expect(result.exitCode).toBe(0);

        // Verify both have index.json in registry
        const skillAIndex = path.join(
          registryDir.path,
          "extensions",
          owner,
          "skills",
          "skill-a",
          "index.json",
        );
        const skillBIndex = path.join(
          registryDir.path,
          "extensions",
          owner,
          "skills",
          "skill-b",
          "index.json",
        );
        expect(fs.existsSync(skillAIndex)).toBe(true);
        expect(fs.existsSync(skillBIndex)).toBe(true);
      } finally {
        temp.cleanup();
        registryDir.cleanup();
      }
    });

    it("nonexistent glob emits an empty machine-readable selection", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        const owner = "@test";

        createManagedExtension(temp.path, owner, "some-skill");

        await setupWorkspace(temp.path, registryDir.path, owner, {
          "some-skill": `${owner}/skills/some-skill`,
        });

        // Publish with a glob that matches nothing
        const result = await runCli(["skills", "publish", "nonexistent-*", "--yes", "--json"], {
          cwd: temp.path,
          env: { AXM_TOKEN: "e2e-test-token" },
        });

        // Should exit cleanly (not an error)
        expect(result.exitCode).toBe(0);

        expect(JSON.parse(result.stdout).result.execution.outcomes).toEqual([]);
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
