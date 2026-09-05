/**
 * E2E tests for the `axm skills install` command.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";
import { getOutput } from "../../../test-helpers.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

describe("axm skills install", () => {
  describe("with local source --all", () => {
    it("installs all skills and creates the project and acquired-package structure", async () => {
      const temp = createTempDir();
      try {
        // Initialize first with claude-code agent to ensure .claude/ symlinks
        await runCli(["setup", "--yes", "--scope", "project", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        // Install all skills
        const result = await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--all"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);
        const output = getOutput(result);
        expect(output).toContain("my-skill");
        expect(output).toContain("another-skill");

        // Verify the root project contract exists
        const settingsPath = path.join(temp.path, "axm.json");
        expect(fs.existsSync(settingsPath)).toBe(true);

        // Verify axm-lock.yaml exists and has entries (YAML format)
        const lockPath = path.join(temp.path, "axm-lock.yaml");
        expect(fs.existsSync(lockPath)).toBe(true);
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        expect(lock).toHaveProperty("lockfileVersion");
        expect(lock).toHaveProperty("skills");
        expect(lock.skills).toHaveProperty("my-skill");
        expect(lock.skills).toHaveProperty("another-skill");

        // Verify symlinks were created in agent directory
        // claude-code skillsDir is ".claude/skills"
        const claudeSkillsDir = path.join(temp.path, ".claude", "skills", "my-skill");
        const anotherClaudeSkillsDir = path.join(temp.path, ".claude", "skills", "another-skill");
        expect(fs.existsSync(claudeSkillsDir)).toBe(true);
        expect(fs.existsSync(anotherClaudeSkillsDir)).toBe(true);
        // Check if it's a symlink
        const stat = fs.lstatSync(claudeSkillsDir);
        expect(stat.isSymbolicLink()).toBe(true);
        const localRoot =
          path.join(fs.realpathSync(temp.path), "agent_extensions", "local") + path.sep;
        expect(fs.realpathSync(claudeSkillsDir).startsWith(localRoot)).toBe(true);
        expect(fs.realpathSync(anotherClaudeSkillsDir).startsWith(localRoot)).toBe(true);
      } finally {
        temp.cleanup();
      }
    });

    it("includes immutable content identity in lockfile entries", async () => {
      const temp = createTempDir();
      try {
        await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--all"], {
          cwd: temp.path,
        });

        const lockPath = path.join(temp.path, "axm-lock.yaml");
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

        // Verify lockfile structure
        expect(lock.lockfileVersion).toBe(7);
        expect(lock.skills).toBeDefined();

        // Each skill entry should have required fields per flat schema
        for (const skillName of ["my-skill", "another-skill"]) {
          const entry = lock.skills[skillName];
          expect(entry).toBeDefined();
          // Flat schema: type is a string discriminator, not nested object
          expect(entry.type).toBe("local");
          expect(entry.path).toBeDefined();
          expect(entry.contentIdentity).toMatch(/^[a-f0-9]{64}$/);
          expect(entry).not.toHaveProperty("agents");
          expect(entry).not.toHaveProperty("installedAt");
          expect(entry).not.toHaveProperty("updatedAt");
        }
      } finally {
        temp.cleanup();
      }
    });

    it("C-27: prints outcome-first output for a single skill install", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--scope", "project", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill"],
          {
            cwd: temp.path,
          },
        );

        expect(result.exitCode).toBe(0);
        const output = getOutput(result);
        const headlineIndex = output.indexOf("Installed 1 skill");
        expect(headlineIndex).toBeGreaterThanOrEqual(0);
        const unitRow =
          "my-skill   created   1 file   .agents/skills/my-skill, .claude/skills/my-skill";
        expect(output.indexOf(unitRow)).toBeGreaterThan(headlineIndex);
        expect(output).toContain("Agents: claude-code");
        expect(output).not.toContain("Source:");
        expect(output).not.toContain("Resolution:");
        expect(output).not.toContain("skill(s)");
        expect(output).not.toContain("https://");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("with invalid source", () => {
    it("shows error and exits non-zero for non-existent path", async () => {
      const temp = createTempDir();
      try {
        await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        const result = await runCli(["skills", "install", "/nonexistent/path/to/skills", "--all"], {
          cwd: temp.path,
        });

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("No skills found in source (not_found)");
      } finally {
        temp.cleanup();
      }
    });

    it("shows error for empty directory (no SKILL.md files)", async () => {
      const temp = createTempDir();
      const emptyDir = createTempDir("empty-skills-");
      try {
        await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        const result = await runCli(["skills", "install", emptyDir.path, "--all"], {
          cwd: temp.path,
        });

        // Should exit with error when no skills found
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("No skills found");
      } finally {
        temp.cleanup();
        emptyDir.cleanup();
      }
    });
  });

  describe("bundled AXM skill recovery", () => {
    it("previews without writes, then replaces a newer incompatible install offline", async () => {
      const temp = createTempDir();
      try {
        const setup = await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );
        expect(setup.exitCode, setup.stderr).toBe(0);

        const packageRoot = path.join(
          temp.path,
          "agent_extensions",
          "agentxm",
          "@agentxm",
          "skills",
          "axm",
        );
        const manifestPath = path.join(packageRoot, "skill.json");
        const skillPath = path.join(packageRoot, "src", "SKILL.md");
        const originalManifest: unknown = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        if (
          typeof originalManifest !== "object" ||
          originalManifest === null ||
          !("version" in originalManifest) ||
          typeof originalManifest.version !== "string"
        ) {
          throw new Error("Bundled AXM skill manifest did not contain a version");
        }
        const originalVersion = originalManifest.version;
        fs.writeFileSync(
          manifestPath,
          JSON.stringify({ owner: "@agentxm", type: "skill", name: "axm", version: "99.0.0" }),
        );
        const incompatible = fs
          .readFileSync(skillPath, "utf8")
          .replaceAll(originalVersion, "99.0.0");
        fs.writeFileSync(skillPath, incompatible);

        const settingsPath = path.join(temp.path, "axm.json");
        const settings: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        if (!isRecord(settings) || !isRecord(settings["skills"])) {
          throw new Error("Setup did not write skill settings");
        }
        fs.writeFileSync(
          settingsPath,
          `${JSON.stringify(
            {
              ...settings,
              skills: { ...settings["skills"], axm: "agentxm:@agentxm/skills/axm" },
            },
            null,
            2,
          )}\n`,
        );
        const lockPath = path.join(temp.path, "axm-lock.yaml");
        const lock: unknown = YAML.parse(fs.readFileSync(lockPath, "utf8"));
        if (!isRecord(lock) || !isRecord(lock["skills"])) {
          throw new Error("Setup did not write a skill lock map");
        }
        fs.writeFileSync(
          lockPath,
          YAML.stringify({
            ...lock,
            skills: {
              ...lock["skills"],
              axm: {
                type: "registry",
                sourceType: "registry",
                endpoint: "https://registry.agentxm.ai",
                extensionType: "skill",
                workspaceName: "axm",
                packageFormat: "agentxm",
                owner: "@agentxm",
                name: "axm",
                resolvedVersion: "99.0.0",
                integrity: `sha512-${Buffer.alloc(64).toString("base64")}`,
                sourceName: "agentxm",
                publisherBindingId: "hbnd_test",
                treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
              },
            },
          }),
        );

        const offlineEnv = { AXM_REGISTRY_LOCATION: "http://127.0.0.1:1" };
        const preview = await runCli(
          ["skills", "install", "@agentxm/skills/axm", "--bundled", "--preview"],
          { cwd: temp.path, env: offlineEnv },
        );
        expect(preview.exitCode, preview.stderr).toBe(0);
        expect(fs.readFileSync(manifestPath, "utf8")).toContain("99.0.0");

        const applied = await runCli(["skills", "install", "@agentxm/skills/axm", "--bundled"], {
          cwd: temp.path,
          env: offlineEnv,
        });
        expect(applied.exitCode, applied.stderr).toBe(0);
        expect(fs.readFileSync(manifestPath, "utf8")).not.toContain("99.0.0");
        expect(fs.readFileSync(skillPath, "utf8")).not.toContain("99.0.0");

        const recoveredSettings: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        expect(recoveredSettings).toMatchObject({
          skills: {
            axm: {
              source: "workspace",
              origin: "bundled",
            },
          },
        });
        const recoveredLock: unknown = YAML.parse(fs.readFileSync(lockPath, "utf8"));
        expect(recoveredLock).toMatchObject({ skills: {} });
        if (!isRecord(recoveredLock) || !isRecord(recoveredLock["skills"])) {
          throw new Error("Recovery did not preserve a skill lock map");
        }
        expect(recoveredLock["skills"]["axm"]).toBeUndefined();

        const lint = await runCli(["lint", "--json"], { cwd: temp.path, env: offlineEnv });
        expect(lint.exitCode, lint.stderr).toBe(0);
        expect(getOutput(lint)).not.toContain("workspace/skills-lockfile-aligned");
        expect(getOutput(lint)).not.toContain("workspace/desired-state-reconcilable");
      } finally {
        temp.cleanup();
      }
    });

    it("rejects invalid bundled selectors with usage exit 2", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["skills", "install", "@acme/skills/axm", "--bundled"], {
          cwd: temp.path,
        });
        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain("restricted to @agentxm/skills/axm");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("file system state verification", () => {
    it("creates expected directory structure", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--scope", "project", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill"], {
          cwd: temp.path,
        });

        // Expected structure:
        // axm.json
        // axm-lock.yaml
        // agent_extensions/local/<source-full-name>/my-skill/
        //     src/SKILL.md
        // .claude/
        //   skills/
        //     my-skill -> symlink to canonical (symlink)

        const settingsPath = path.join(temp.path, "axm.json");
        const lockPath = path.join(temp.path, "axm-lock.yaml");
        const agentSkillDir = path.join(temp.path, ".claude", "skills", "my-skill");
        const canonicalSkillSrc = fs.realpathSync(agentSkillDir);
        const canonicalSkillDir = path.dirname(canonicalSkillSrc);
        const canonicalSkillMd = path.join(canonicalSkillSrc, "SKILL.md");

        expect(fs.existsSync(settingsPath)).toBe(true);
        expect(fs.existsSync(lockPath)).toBe(true);
        expect(fs.existsSync(canonicalSkillDir)).toBe(true);
        expect(fs.existsSync(canonicalSkillMd)).toBe(true);

        // Verify symlink in agent directory (.claude/skills for claude-code)
        expect(fs.existsSync(agentSkillDir)).toBe(true);
        expect(fs.lstatSync(agentSkillDir).isSymbolicLink()).toBe(true);

        // Verify symlink target resolves correctly
        const resolvedTarget = fs.realpathSync(agentSkillDir);
        expect(resolvedTarget).toBe(fs.realpathSync(canonicalSkillSrc));
      } finally {
        temp.cleanup();
      }
    });

    it("axm.json preserves agents after installation", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--scope", "project", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill"], {
          cwd: temp.path,
        });

        const settingsPath = path.join(temp.path, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

        // Settings should still have agents
        expect(settings).toHaveProperty("agents");
        expect(settings.agents).toContain("claude-code");
      } finally {
        temp.cleanup();
      }
    });

    it("axm-lock.yaml contains lock entry for installed skill with new schema", async () => {
      const temp = createTempDir();
      try {
        await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill"], {
          cwd: temp.path,
        });

        const lockPath = path.join(temp.path, "axm-lock.yaml");
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

        // Verify new lockfile structure
        expect(lock.lockfileVersion).toBe(7);
        expect(lock.skills).toBeDefined();
        expect(lock.skills["my-skill"]).toBeDefined();

        const entry = lock.skills["my-skill"];
        // Flat schema: source is a string discriminator, path is at top level
        expect(entry.type).toBe("local");
        expect(entry.path).toBeDefined();
        expect(entry.contentIdentity).toMatch(/^[a-f0-9]{64}$/);
        expect(entry.agents).toBeUndefined();
        expect(entry.installedAt).toBeUndefined();
        expect(entry.updatedAt).toBeUndefined();
      } finally {
        temp.cleanup();
      }
    });

    it("symlinks point to canonical skill directory", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--scope", "project", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--all"], {
          cwd: temp.path,
        });

        for (const skillName of ["my-skill", "another-skill"]) {
          // claude-code skillsDir is ".claude/skills"
          const agentSkillDir = path.join(temp.path, ".claude", "skills", skillName);
          expect(fs.lstatSync(agentSkillDir).isSymbolicLink()).toBe(true);

          // Read the symlink and verify it points to the canonical location
          const linkTarget = fs.readlinkSync(agentSkillDir);
          // Resolve relative symlink
          const resolvedLink = path.resolve(path.dirname(agentSkillDir), linkTarget);
          expect(fs.realpathSync(resolvedLink)).toBe(fs.realpathSync(agentSkillDir));
          expect(
            fs
              .realpathSync(resolvedLink)
              .startsWith(
                path.join(fs.realpathSync(temp.path), "agent_extensions", "local") + path.sep,
              ),
          ).toBe(true);
        }
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("conflict detection", () => {
    it("repairs already installed local skill (local sources always update)", async () => {
      const temp = createTempDir();
      try {
        await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        // First install
        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill"], {
          cwd: temp.path,
        });

        // Second install of same local skill triggers repair (no stable identifier)
        const result = await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        expect(getOutput(result)).toMatch(/already up to date|update|install/i);
      } finally {
        temp.cleanup();
      }
    });

    it("overwrites existing skill with --reinstall", async () => {
      const temp = createTempDir();
      try {
        await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        // First install
        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill"], {
          cwd: temp.path,
        });

        // Second install with --reinstall should succeed
        const result = await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--reinstall"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        expect(getOutput(result)).toContain("1 skill already current");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("--help", () => {
    it("displays usage information", async () => {
      const result = await runCli(["skills", "install", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("skills install");
      expect(result.stdout).toContain("--all");
      expect(result.stdout).not.toContain("--yes");
      expect(result.stdout).toContain("--skill");
      expect(result.stdout).toContain("--scope");
      expect(result.stdout).toContain("--reinstall");
      expect(result.stdout).toContain("--preview");
      // Verify removed flags are not in help output
      expect(result.stdout).not.toContain("--list");
      expect(result.stdout).not.toContain("--agent");
    });
  });

  describe("--preview", () => {
    it("shows installation plan without making changes", async () => {
      const temp = createTempDir();
      try {
        await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        const result = await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--preview", "--non-interactive"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        const output = getOutput(result);
        expect(output).toContain("my-skill");
        expect(output).toContain("another-skill");
        expect(output).toMatch(/\+.*my-skill|\+.*another-skill/);
        expect(output).toContain("Would install");

        // Verify no files were created
        const localExtensionsRoot = path.join(temp.path, "agent_extensions", "local");
        expect(fs.existsSync(localExtensionsRoot)).toBe(false);
      } finally {
        temp.cleanup();
      }
    });

    it("shows summary with counts", async () => {
      const temp = createTempDir();
      try {
        await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        const result = await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--preview", "--non-interactive"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        expect(getOutput(result)).toMatch(/\d+ to install/);
      } finally {
        temp.cleanup();
      }
    });

    it("shows repair when skill exists with different content (hash mismatch)", async () => {
      const temp = createTempDir();
      try {
        await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        // First install a skill
        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill"], {
          cwd: temp.path,
        });

        // Modify the installed skill to simulate local changes (creates hash mismatch)
        const skillMdPath = path.join(
          fs.realpathSync(path.join(temp.path, ".claude", "skills", "my-skill")),
          "SKILL.md",
        );
        const originalContent = fs.readFileSync(skillMdPath, "utf-8");
        fs.writeFileSync(skillMdPath, `${originalContent}\n# Modified locally`);

        // Run preview with reinstall - should show repair due to hash mismatch
        const result = await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--preview",
            "--non-interactive",
            "--reinstall",
          ],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        const output = getOutput(result);
        expect(output).toContain("my-skill");
        expect(output).toMatch(/\+.*my-skill|to install/);
        expect(output).toContain("Would install");
      } finally {
        temp.cleanup();
      }
    });

    it("reinstalling same skill shows install plan (idempotent)", async () => {
      const temp = createTempDir();
      try {
        await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        // Install a skill
        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill"], {
          cwd: temp.path,
        });

        // Run preview for the same skill - install operations are idempotent
        const result = await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--preview",
            "--non-interactive",
          ],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        expect(getOutput(result)).toContain("my-skill");
      } finally {
        temp.cleanup();
      }
    });
  });
});
