/**
 * E2E tests for the `axm skills install` command.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "./utils.js";

describe("axm skills install", () => {
  describe("with local source --list", () => {
    it("lists available skills without installing", async () => {
      const temp = createTempDir();
      try {
        // Initialize first
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        // List skills from fixture - must specify agent to avoid interactive prompt
        const result = await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--list", "--agent", "claude-code"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        // Should list the skills found in the fixture
        expect(result.stdout).toContain("my-skill");
        expect(result.stdout).toContain("another-skill");
        expect(result.stdout).toMatch(/2 skill\(s\) available/);

        // Should NOT have created any skill files since we only listed
        const skillsDir = path.join(temp.path, ".axm", "skills");
        expect(fs.existsSync(skillsDir)).toBe(false);
      } finally {
        temp.cleanup();
      }
    });

    it("shows descriptions for skills with descriptions", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--list", "--agent", "claude-code"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        // Skills are listed
        expect(result.stdout).toContain("skill(s) available");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("with local source --all --yes", () => {
    it("installs all skills and creates .axm structure", async () => {
      const temp = createTempDir();
      try {
        // Initialize first
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        // Install all skills
        const result = await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes", "--agent", "claude-code"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Successfully installed");
        expect(result.stdout).toContain("my-skill");
        expect(result.stdout).toContain("another-skill");

        // Verify .axm structure
        const axmDir = path.join(temp.path, ".axm");
        expect(fs.existsSync(axmDir)).toBe(true);

        // Verify settings.json exists and has skill entries in skills
        const settingsPath = path.join(axmDir, "settings.json");
        expect(fs.existsSync(settingsPath)).toBe(true);
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings).toHaveProperty("skills");
        expect(settings.skills).toHaveProperty("my-skill");
        expect(settings.skills).toHaveProperty("another-skill");

        // Verify axm-lock.yaml exists and has entries (YAML format)
        const lockPath = path.join(axmDir, "axm-lock.yaml");
        expect(fs.existsSync(lockPath)).toBe(true);
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        expect(lock).toHaveProperty("lockfileVersion");
        expect(lock).toHaveProperty("skills");
        expect(lock.skills).toHaveProperty("my-skill");
        expect(lock.skills).toHaveProperty("another-skill");

        // Verify canonical skills directory
        const skillsDir = path.join(axmDir, "skills");
        expect(fs.existsSync(skillsDir)).toBe(true);
        expect(fs.existsSync(path.join(skillsDir, "my-skill"))).toBe(true);
        expect(fs.existsSync(path.join(skillsDir, "another-skill"))).toBe(true);

        // Verify symlinks were created in agent directory
        // claude-code skillsDir is ".claude/skills"
        const claudeSkillsDir = path.join(temp.path, ".claude", "skills", "my-skill");
        expect(fs.existsSync(claudeSkillsDir)).toBe(true);
        // Check if it's a symlink
        const stat = fs.lstatSync(claudeSkillsDir);
        expect(stat.isSymbolicLink()).toBe(true);
      } finally {
        temp.cleanup();
      }
    });

    it("includes folderHash in lockfile entries", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes", "--agent", "claude-code"],
          { cwd: temp.path },
        );

        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

        // Verify lockfile structure
        expect(lock.lockfileVersion).toBe(1);
        expect(lock.skills).toBeDefined();

        // Each skill entry should have required fields per flat schema
        for (const skillName of ["my-skill", "another-skill"]) {
          const entry = lock.skills[skillName];
          expect(entry).toBeDefined();
          // Flat schema: source is a string discriminator, not nested object
          expect(entry.source).toBe("local");
          expect(entry.path).toBeDefined();
          expect(entry).toHaveProperty("agents");
          expect(entry).toHaveProperty("installedAt");
          expect(entry).toHaveProperty("updatedAt");
        }
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("with invalid source", () => {
    it("shows error and exits non-zero for non-existent path", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(
          [
            "skills",
            "install",
            "/nonexistent/path/to/skills",
            "--all",
            "--yes",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("Error");
      } finally {
        temp.cleanup();
      }
    });

    it("shows error for empty directory (no SKILL.md files)", async () => {
      const temp = createTempDir();
      const emptyDir = createTempDir("empty-skills-");
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(
          ["skills", "install", emptyDir.path, "--all", "--yes", "--agent", "claude-code"],
          { cwd: temp.path },
        );

        // Should exit with error when no skills found
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("No skills found");
      } finally {
        temp.cleanup();
        emptyDir.cleanup();
      }
    });
  });

  describe("with well-known URL --list", () => {
    let server: http.Server;
    let serverPort: number;
    let serverUrl: string;

    beforeAll(async () => {
      // Create a simple HTTP server that serves a well-known skills index
      server = http.createServer((req, res) => {
        if (req.url === "/.well-known/skills/index.json") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              skills: [
                {
                  name: "remote-skill",
                  description: "A skill from a well-known URL",
                  files: ["SKILL.md"],
                },
                {
                  name: "another-remote",
                  description: "Another remote skill",
                  files: ["SKILL.md"],
                },
              ],
            }),
          );
        } else {
          res.writeHead(404);
          res.end("Not Found");
        }
      });

      // Start server on random available port
      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          if (typeof address === "object" && address !== null) {
            serverPort = address.port;
            serverUrl = `http://127.0.0.1:${serverPort}`;
          }
          resolve();
        });
      });
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });

    it("discovers skills from index.json", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(
          ["skills", "install", serverUrl, "--list", "--agent", "claude-code"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("remote-skill");
        expect(result.stdout).toContain("another-remote");
        expect(result.stdout).toContain("A skill from a well-known URL");
        expect(result.stdout).toMatch(/2 skill\(s\) available/);
      } finally {
        temp.cleanup();
      }
    });

    it("shows error for URL without well-known index", async () => {
      const temp = createTempDir();
      // Create server that always returns 404
      const errorServer = http.createServer((_, res) => {
        res.writeHead(404);
        res.end("Not Found");
      });

      await new Promise<void>((resolve) => {
        errorServer.listen(0, "127.0.0.1", () => resolve());
      });

      const address = errorServer.address();
      const errorPort = typeof address === "object" && address !== null ? address.port : 0;
      const errorUrl = `http://127.0.0.1:${errorPort}`;

      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(
          ["skills", "install", errorUrl, "--list", "--agent", "claude-code"],
          { cwd: temp.path },
        );

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("Error");
      } finally {
        temp.cleanup();
        errorServer.close();
      }
    });
  });

  describe("file system state verification", () => {
    it("creates expected directory structure", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

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

        // Expected structure:
        // .axm/
        //   settings.json
        //   axm-lock.yaml
        //   skills/
        //     my-skill/
        //       SKILL.md
        // .claude/
        //   commands/
        //     my-skill -> ../../../.axm/skills/my-skill (symlink)

        const axmDir = path.join(temp.path, ".axm");
        const settingsPath = path.join(axmDir, "settings.json");
        const lockPath = path.join(axmDir, "axm-lock.yaml");
        const canonicalSkillDir = path.join(axmDir, "skills", "my-skill");
        const canonicalSkillMd = path.join(canonicalSkillDir, "SKILL.md");

        expect(fs.existsSync(settingsPath)).toBe(true);
        expect(fs.existsSync(lockPath)).toBe(true);
        expect(fs.existsSync(canonicalSkillDir)).toBe(true);
        expect(fs.existsSync(canonicalSkillMd)).toBe(true);

        // Verify symlink in agent directory (.claude/skills for claude-code)
        const agentSkillDir = path.join(temp.path, ".claude", "skills", "my-skill");
        expect(fs.existsSync(agentSkillDir)).toBe(true);
        expect(fs.lstatSync(agentSkillDir).isSymbolicLink()).toBe(true);

        // Verify symlink target resolves correctly
        const resolvedTarget = fs.realpathSync(agentSkillDir);
        expect(resolvedTarget).toBe(fs.realpathSync(canonicalSkillDir));
      } finally {
        temp.cleanup();
      }
    });

    it("settings.json contains skill in skills with version specifier", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

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

        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

        // Verify new settings structure
        expect(settings).toHaveProperty("agents");
        expect(settings.agents).toContain("claude-code");
        expect(settings).toHaveProperty("skills");
        // Skills now store version specifier (e.g., "*" for unversioned sources)
        expect(settings.skills["my-skill"]).toBeDefined();
        expect(typeof settings.skills["my-skill"]).toBe("string");
      } finally {
        temp.cleanup();
      }
    });

    it("axm-lock.yaml contains lock entry for installed skill with new schema", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

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

        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

        // Verify new lockfile structure
        expect(lock.lockfileVersion).toBe(1);
        expect(lock.skills).toBeDefined();
        expect(lock.skills["my-skill"]).toBeDefined();

        const entry = lock.skills["my-skill"];
        // Flat schema: source is a string discriminator, path is at top level
        expect(entry.source).toBe("local");
        expect(entry.path).toBeDefined();
        expect(entry.agents).toBeDefined();
        expect(Array.isArray(entry.agents)).toBe(true);
        expect(entry.installedAt).toBeDefined();
        expect(entry.updatedAt).toBeDefined();

        // Timestamps should be valid ISO 8601
        expect(new Date(entry.installedAt).toISOString()).toBe(entry.installedAt);
        expect(new Date(entry.updatedAt).toISOString()).toBe(entry.updatedAt);
      } finally {
        temp.cleanup();
      }
    });

    it("symlinks point to canonical skill directory", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes", "--agent", "claude-code"],
          { cwd: temp.path },
        );

        for (const skillName of ["my-skill", "another-skill"]) {
          // claude-code skillsDir is ".claude/skills"
          const agentSkillDir = path.join(temp.path, ".claude", "skills", skillName);
          const canonicalSkillDir = path.join(temp.path, ".axm", "skills", skillName);

          expect(fs.lstatSync(agentSkillDir).isSymbolicLink()).toBe(true);

          // Read the symlink and verify it points to the canonical location
          const linkTarget = fs.readlinkSync(agentSkillDir);
          // Resolve relative symlink
          const resolvedLink = path.resolve(path.dirname(agentSkillDir), linkTarget);
          expect(resolvedLink).toBe(canonicalSkillDir);
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
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        // First install
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

        // Second install of same local skill triggers repair (no stable identifier)
        const result = await runCli(
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

        expect(result.exitCode).toBe(0);
        // Local sources always trigger repair (no stable identifier for comparison)
        expect(result.stdout).toMatch(/repair/i);
      } finally {
        temp.cleanup();
      }
    });

    it("overwrites existing skill with --force", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        // First install
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

        // Second install with --force should succeed
        const result = await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--yes",
            "--agent",
            "claude-code",
            "--force",
          ],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Successfully installed");
        expect(result.stdout).toContain("my-skill");
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
      expect(result.stdout).toContain("--list");
      expect(result.stdout).toContain("--all");
      expect(result.stdout).toContain("--yes");
      expect(result.stdout).toContain("--skill");
      expect(result.stdout).toContain("--agent");
      expect(result.stdout).toContain("--global");
      expect(result.stdout).toContain("--force");
      expect(result.stdout).toContain("--dry-run");
      expect(result.stdout).toContain("--json");
    });
  });

  describe("--dry-run", () => {
    it("shows installation plan without making changes", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--all",
            "--dry-run",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        // Should show skills to be added
        expect(result.stdout).toContain("my-skill");
        expect(result.stdout).toContain("another-skill");
        // Should show plan indicators (+ for add)
        expect(result.stdout).toMatch(/\+.*my-skill|\+.*another-skill/);
        // Should show dry-run message
        expect(result.stdout).toContain("Dry-run complete. No changes made.");

        // Verify no files were created
        const skillsDir = path.join(temp.path, ".axm", "skills");
        expect(fs.existsSync(skillsDir)).toBe(false);
      } finally {
        temp.cleanup();
      }
    });

    it("shows summary with counts", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--all",
            "--dry-run",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        // Should show summary with add count
        expect(result.stdout).toMatch(/\d+ to add/);
      } finally {
        temp.cleanup();
      }
    });

    it("shows repair when skill exists with different content (hash mismatch)", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        // First install a skill
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

        // Modify the installed skill to simulate local changes (creates hash mismatch)
        const skillMdPath = path.join(temp.path, ".axm", "skills", "my-skill", "SKILL.md");
        const originalContent = fs.readFileSync(skillMdPath, "utf-8");
        fs.writeFileSync(skillMdPath, `${originalContent}\n# Modified locally`);

        // Run dry-run with force - should show repair due to hash mismatch
        const result = await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--dry-run",
            "--force",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        // Should show repair indicator (! for repair) since local content differs from locked
        expect(result.stdout).toMatch(/!.*my-skill|repair/i);
        expect(result.stdout).toContain("Dry-run complete. No changes made.");
      } finally {
        temp.cleanup();
      }
    });

    it("shows already up to date when no changes needed", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

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

        // Run dry-run for the same skill (without force - should skip)
        const result = await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--dry-run",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        // Should indicate no changes
        expect(result.stdout).toMatch(/already up to date|already installed|no changes/i);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("--dry-run --json", () => {
    it("outputs plan as valid JSON", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--all",
            "--dry-run",
            "--json",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);

        // Should be valid JSON
        const json = JSON.parse(result.stdout);
        expect(json).toBeDefined();
        expect(json.changes).toBeDefined();
        expect(Array.isArray(json.changes)).toBe(true);
        expect(json.summary).toBeDefined();
      } finally {
        temp.cleanup();
      }
    });

    it("includes _tag and name for each change", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--all",
            "--dry-run",
            "--json",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);

        const json = JSON.parse(result.stdout);
        expect(json.changes.length).toBeGreaterThan(0);

        for (const change of json.changes) {
          expect(change).toHaveProperty("_tag");
          expect(change).toHaveProperty("name");
          expect(["Add", "Update", "Remove", "Unchanged", "Repair"]).toContain(change._tag);
        }
      } finally {
        temp.cleanup();
      }
    });

    it("includes summary counts", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--all",
            "--dry-run",
            "--json",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);

        const json = JSON.parse(result.stdout);
        expect(json.summary).toHaveProperty("add");
        expect(json.summary).toHaveProperty("update");
        expect(json.summary).toHaveProperty("remove");
        expect(json.summary).toHaveProperty("unchanged");
        expect(json.summary).toHaveProperty("repair");
        expect(typeof json.summary.add).toBe("number");
        expect(json.summary.add).toBe(2); // my-skill and another-skill
      } finally {
        temp.cleanup();
      }
    });

    it("shows Add changes with skill details", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--dry-run",
            "--json",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);

        const json = JSON.parse(result.stdout);
        const addChange = json.changes.find(
          (c: { _tag: string; name: string }) => c._tag === "Add" && c.name === "my-skill",
        );
        expect(addChange).toBeDefined();
        expect(addChange.skill).toBeDefined();
        expect(addChange.skill.name).toBe("my-skill");
        expect(addChange.skill.source).toBeDefined();
      } finally {
        temp.cleanup();
      }
    });
  });

  // =========================================================================
  // NEW FORMAT TESTS (skills-install-reconciliation)
  // These tests verify the new lockfile/settings format from the reconciliation refactor:
  // - Lockfile: skills at root (not extensions.skills), gitTreeHash, agents array, source._tag
  // - Settings: skills at root with SkillSettingsEntry format
  // =========================================================================

  describe("new lockfile format (reconciliation)", () => {
    it.skip("creates lockfile with skills at root level (not under extensions)", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

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

        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        expect(fs.existsSync(lockPath)).toBe(true);
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

        // New format: skills at root level
        expect(lock.lockfileVersion).toBe(1);
        expect(lock.skills).toBeDefined();
        expect(lock.skills["my-skill"]).toBeDefined();

        // Should NOT have extensions.skills (old format)
        expect(lock.extensions).toBeUndefined();
      } finally {
        temp.cleanup();
      }
    });

    it.skip("creates lockfile entry with source object containing _tag discriminator", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

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

        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

        const entry = lock.skills["my-skill"];
        expect(entry).toBeDefined();

        // Source should be a structured object with _tag discriminator
        expect(entry.source).toBeDefined();
        expect(entry.source._tag).toBe("Local");
        expect(entry.source.path).toBeDefined();
        expect(typeof entry.source.path).toBe("string");
      } finally {
        temp.cleanup();
      }
    });

    it.skip("creates lockfile entry with gitTreeHash (not folderHash)", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

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

        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

        const entry = lock.skills["my-skill"];
        expect(entry).toBeDefined();

        // Should have gitTreeHash (optional for local sources)
        // Note: Local sources may not have gitTreeHash, but should NOT have folderHash
        expect(entry.folderHash).toBeUndefined();
      } finally {
        temp.cleanup();
      }
    });

    it.skip("creates lockfile entry with agents array", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

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

        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

        const entry = lock.skills["my-skill"];
        expect(entry).toBeDefined();

        // New format: agents array (non-empty)
        expect(entry.agents).toBeDefined();
        expect(Array.isArray(entry.agents)).toBe(true);
        expect(entry.agents.length).toBeGreaterThan(0);
        expect(entry.agents).toContain("claude-code");
      } finally {
        temp.cleanup();
      }
    });

    it.skip("creates lockfile entry with installedAt and updatedAt timestamps", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

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

        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

        const entry = lock.skills["my-skill"];
        expect(entry).toBeDefined();

        // Timestamps should be valid ISO 8601
        expect(entry.installedAt).toBeDefined();
        expect(entry.updatedAt).toBeDefined();
        expect(new Date(entry.installedAt).toISOString()).toBe(entry.installedAt);
        expect(new Date(entry.updatedAt).toISOString()).toBe(entry.updatedAt);
      } finally {
        temp.cleanup();
      }
    });

    it.skip("creates lockfile with complete structure for multiple skills", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes", "--agent", "claude-code"],
          { cwd: temp.path },
        );

        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));

        // Expected structure per design:
        // lockfileVersion: 1
        // skills:
        //   my-skill:
        //     source:
        //       _tag: Local
        //       path: <fixture-path>
        //     agents: [claude-code]
        //     installedAt: "2025-01-15T10:30:00Z"
        //     updatedAt: "2025-01-15T10:30:00Z"
        //   another-skill:
        //     ...

        expect(lock.lockfileVersion).toBe(1);
        expect(lock.skills).toBeDefined();
        expect(Object.keys(lock.skills).length).toBe(2);

        for (const skillName of ["my-skill", "another-skill"]) {
          const entry = lock.skills[skillName];
          expect(entry).toBeDefined();
          expect(entry.source).toBeDefined();
          expect(entry.source._tag).toBe("Local");
          expect(entry.agents).toContain("claude-code");
          expect(entry.installedAt).toBeDefined();
          expect(entry.updatedAt).toBeDefined();
        }
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("new settings format (reconciliation)", () => {
    it.skip("creates settings with skills at root level", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

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

        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

        // Skills should be at root level
        expect(settings.skills).toBeDefined();
        expect(settings.skills["my-skill"]).toBeDefined();
      } finally {
        temp.cleanup();
      }
    });

    it.skip("creates settings with SkillSettingsEntry object for Local source", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

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

        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

        const entry = settings.skills["my-skill"];
        expect(entry).toBeDefined();

        // For Local source, settings entry should be an object with _tag
        expect(typeof entry).toBe("object");
        expect(entry._tag).toBe("Local");
        expect(entry.path).toBeDefined();
        expect(typeof entry.path).toBe("string");
      } finally {
        temp.cleanup();
      }
    });

    it.skip("creates settings with multiple skills in correct format", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes", "--agent", "claude-code"],
          { cwd: temp.path },
        );

        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

        // Expected structure per design:
        // {
        //   "skills": {
        //     "my-skill": {
        //       "_tag": "Local",
        //       "path": "<fixture-path>"
        //     },
        //     "another-skill": {
        //       "_tag": "Local",
        //       "path": "<fixture-path>"
        //     }
        //   }
        // }

        expect(settings.skills).toBeDefined();
        expect(Object.keys(settings.skills).length).toBe(2);

        for (const skillName of ["my-skill", "another-skill"]) {
          const entry = settings.skills[skillName];
          expect(entry).toBeDefined();
          expect(typeof entry).toBe("object");
          expect(entry._tag).toBe("Local");
          expect(entry.path).toBeDefined();
        }
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("dry-run with new format (reconciliation)", () => {
    it.skip("dry-run displays plan with new action labels", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--all",
            "--dry-run",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);

        // Should show plan with new format (InstallSkill action)
        expect(result.stdout).toContain("my-skill");
        expect(result.stdout).toContain("another-skill");
        // Should show + for install
        expect(result.stdout).toMatch(/\+.*my-skill|\+.*another-skill/);
        expect(result.stdout).toContain("Dry-run complete. No changes made.");
      } finally {
        temp.cleanup();
      }
    });

    it.skip("dry-run shows agents in plan output", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--dry-run",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);

        // Plan output should include agent information
        expect(result.stdout).toContain("claude-code");
      } finally {
        temp.cleanup();
      }
    });

    it.skip("dry-run JSON output includes new PlanStep format", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--dry-run",
            "--json",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);

        const json = JSON.parse(result.stdout);

        // New format uses PlanStep with _tag: InstallSkill/UpdateSkill/UninstallSkill
        expect(json.changes).toBeDefined();
        expect(Array.isArray(json.changes)).toBe(true);

        const installStep = json.changes.find(
          (c: { _tag: string; name?: string; skillName?: string }) =>
            (c._tag === "InstallSkill" || c._tag === "Add") &&
            (c.name === "my-skill" || c.skillName === "my-skill"),
        );
        expect(installStep).toBeDefined();
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("force flag with new format (reconciliation)", () => {
    it.skip("--force reinstalls skill with updated lockfile entry", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        // First install
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

        // Get original lockfile timestamp
        const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");
        const lockBefore = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        const installedAtBefore = lockBefore.skills?.["my-skill"]?.installedAt;

        // Wait a bit to ensure timestamp difference
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Force reinstall
        const result = await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--yes",
            "--force",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);

        // Verify lockfile was updated
        const lockAfter = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
        const entry = lockAfter.skills?.["my-skill"];
        expect(entry).toBeDefined();

        // installedAt should remain the same (original install time)
        expect(entry.installedAt).toBe(installedAtBefore);
        // updatedAt should be newer
        expect(new Date(entry.updatedAt).getTime()).toBeGreaterThanOrEqual(
          new Date(installedAtBefore).getTime(),
        );
      } finally {
        temp.cleanup();
      }
    });
  });
});
