/**
 * E2E tests for the `axm skills install` command.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import {
  createTempDir,
  runCli,
  SKILLS_REPO_FIXTURE,
  writeDefaultRegistrySettings,
} from "../../../e2e/utils.js";
import { getOutput } from "../../../test-helpers.js";
import { LOCKFILE_VERSION, boundPackage, readLockfile } from "../../../test-support/lockfile.js";

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

        // Verify axm.lock exists and has entries (TOML format)
        const lockPath = path.join(temp.path, "axm.lock");
        expect(fs.existsSync(lockPath)).toBe(true);
        const lock = readLockfile(lockPath);
        expect(lock).toHaveProperty("version");
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
          path.join(fs.realpathSync(temp.path), "agent_extensions", "_local") + path.sep;
        expect(fs.realpathSync(claudeSkillsDir).startsWith(localRoot)).toBe(true);
        expect(fs.realpathSync(anotherClaudeSkillsDir).startsWith(localRoot)).toBe(true);
        expect(lock.version).toBe(LOCKFILE_VERSION);
        for (const skillName of ["my-skill", "another-skill"]) {
          const entry = lock.skills?.[skillName];
          expect(entry).toBeDefined();
          const record = boundPackage(lock, "skills", skillName);
          expect(Object.keys(record.source).sort()).toEqual(["format", "path"]);
          expect(record.source["path"]).toBeDefined();
          expect(record.tree).toMatch(/^sha256-tree-v2:[a-f0-9]{64}$/);
          expect(entry).not.toHaveProperty("agents");
          expect(entry).not.toHaveProperty("installedAt");
          expect(entry).not.toHaveProperty("updatedAt");

          const agentSkillDir = path.join(temp.path, ".claude", "skills", skillName);
          expect(fs.lstatSync(agentSkillDir).isSymbolicLink()).toBe(true);
          const linkTarget = fs.readlinkSync(agentSkillDir);
          const resolvedLink = path.resolve(path.dirname(agentSkillDir), linkTarget);
          expect(fs.realpathSync(resolvedLink)).toBe(fs.realpathSync(agentSkillDir));
          expect(fs.realpathSync(resolvedLink).startsWith(localRoot)).toBe(true);
        }
      } finally {
        temp.cleanup();
      }
    });

    it("prints a ledger and then its verdict for a single skill install", async () => {
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
        // The rows carry the marks and the verdict follows them, so the
        // outcome is the last thing a reader sees, not the first.
        const verdictIndex = output.indexOf("Installed 1 skill");
        expect(verdictIndex).toBeGreaterThanOrEqual(0);
        const unitRow = "skills/my-skill               created   1 file";
        expect(output.indexOf(unitRow)).toBeGreaterThanOrEqual(0);
        expect(output.indexOf(unitRow)).toBeLessThan(verdictIndex);
        expect(output).toMatch(/Installing {2}in this project [·-] agents: claude-code/);
        expect(output).not.toContain("Source:");
        expect(output).not.toContain("Resolution:");
        expect(output).not.toContain("skill(s)");
        expect(output).not.toContain("https://");
        const settingsPath = path.join(temp.path, "axm.json");
        const lockPath = path.join(temp.path, "axm.lock");
        const agentSkillDir = path.join(temp.path, ".claude", "skills", "my-skill");
        expect(fs.existsSync(settingsPath)).toBe(true);
        expect(fs.existsSync(lockPath)).toBe(true);
        expect(fs.existsSync(agentSkillDir)).toBe(true);
        expect(fs.lstatSync(agentSkillDir).isSymbolicLink()).toBe(true);
        const canonicalSkillSrc = fs.realpathSync(agentSkillDir);
        expect(fs.existsSync(path.dirname(canonicalSkillSrc))).toBe(true);
        expect(fs.existsSync(path.join(canonicalSkillSrc, "SKILL.md"))).toBe(true);
        const settings: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        expect(settings).toMatchObject({ agents: expect.arrayContaining(["claude-code"]) });

        const lock = readLockfile(lockPath);
        expect(lock.version).toBe(LOCKFILE_VERSION);
        expect(lock.skills).toBeDefined();
        const entry = lock.skills?.["my-skill"];
        expect(entry).toBeDefined();
        const record = boundPackage(lock, "skills", "my-skill");
        expect(Object.keys(record.source).sort()).toEqual(["format", "path"]);
        expect(record.source["path"]).toBeDefined();
        expect(record.tree).toMatch(/^sha256-tree-v2:[a-f0-9]{64}$/);
        expect(entry).not.toHaveProperty("agents");
        expect(entry).not.toHaveProperty("installedAt");
        expect(entry).not.toHaveProperty("updatedAt");
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
        expect(result.stderr).toContain("No skills found in source");
        expect(result.stderr).toContain("not_found, exit 3");
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
          "registry.agentxm.ai",
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
              skills: { ...settings["skills"], axm: "test:@agentxm/skills/axm" },
            },
            null,
            2,
          )}\n`,
        );
        const lockPath = path.join(temp.path, "axm.lock");
        const lock = parseToml(fs.readFileSync(lockPath, "utf8"));
        const staleId = "registry.agentxm.ai/@agentxm/skills/axm";
        fs.writeFileSync(
          lockPath,
          stringifyToml({
            ...lock,
            package: [
              ...(Array.isArray(lock["package"]) ? lock["package"] : []),
              {
                id: staleId,
                source: { registry: "https://registry.agentxm.ai" },
                version: "99.0.0",
                archive: `sha512-${Buffer.alloc(64).toString("base64")}`,
                publisher: "hbnd_test",
                tree: `sha256-tree-v2:${"0".repeat(64)}`,
              },
            ],
            skills: {
              ...(isRecord(lock["skills"]) ? lock["skills"] : {}),
              axm: { package: staleId, name: "@agentxm/skills/axm" },
            },
          }),
        );

        writeDefaultRegistrySettings(path.join(temp.path, "axm.json"), "http://127.0.0.1:1");
        const preview = await runCli(
          ["skills", "install", "@agentxm/skills/axm", "--bundled", "--preview"],
          { cwd: temp.path },
        );
        expect(preview.exitCode, preview.stderr).toBe(0);
        expect(fs.readFileSync(manifestPath, "utf8")).toContain("99.0.0");

        const applied = await runCli(["skills", "install", "@agentxm/skills/axm", "--bundled"], {
          cwd: temp.path,
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
        const recoveredLock = readLockfile(lockPath);
        expect(recoveredLock.skills?.["axm"]).toBeUndefined();
        expect(recoveredLock.package?.map((record) => record.id) ?? []).not.toContain(staleId);

        const lint = await runCli(["lint", "--json"], { cwd: temp.path });
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
        expect(result.stderr).toContain("restricted to `axm skills install @agentxm/skills/axm`");
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

        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        expect(getOutput(result)).toMatch(/already up to date|update|install/i);
      } finally {
        temp.cleanup();
      }
    });

    it("reacquires an accepted skill through update --reinstall", async () => {
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

        // Reacquire the accepted selection through the update route.
        const result = await runCli(["skills", "update", "--reinstall", "my-skill"], {
          cwd: temp.path,
        });

        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
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
      expect(result.stdout).not.toContain("--reinstall");
      expect(result.stdout).toContain("--preview");
      // Verify removed flags are not in help output
      expect(result.stdout).not.toContain("--list");
      expect(result.stdout).toContain("--agent");
      expect(result.stdout).toContain("Configure an agent on first install");
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
        const localExtensionsRoot = path.join(temp.path, "agent_extensions", "_local");
        expect(fs.existsSync(localExtensionsRoot)).toBe(false);
        expect(output).toMatch(/Would install \d+ skills?/);
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

        // An explicit local source repairs its requested skill during ordinary install.
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

        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        const output = getOutput(result);
        expect(output).toContain("my-skill");
        expect(output).toMatch(/~.*my-skill.*update/);
        expect(output).toContain("Would install");
        expect(fs.readFileSync(skillMdPath, "utf-8")).toBe(
          `${originalContent}\n# Modified locally`,
        );
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
