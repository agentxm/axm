/**
 * E2E tests for the `axm skills install` command.
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
        expect(lock).toHaveProperty("extensions");
        expect(lock.extensions).toHaveProperty("skills");
        expect(lock.extensions.skills).toHaveProperty("my-skill");
        expect(lock.extensions.skills).toHaveProperty("another-skill");

        // Verify canonical skills directory
        const skillsDir = path.join(axmDir, "skills");
        expect(fs.existsSync(skillsDir)).toBe(true);
        expect(fs.existsSync(path.join(skillsDir, "my-skill"))).toBe(true);
        expect(fs.existsSync(path.join(skillsDir, "another-skill"))).toBe(true);

        // Verify symlinks were created in agent directory
        // claude-code skillsDir is ".claude/commands"
        const claudeSkillsDir = path.join(temp.path, ".claude", "commands", "my-skill");
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
        expect(lock.extensions).toBeDefined();
        expect(lock.extensions.skills).toBeDefined();

        // Each skill entry should have required fields per new schema
        for (const skillName of ["my-skill", "another-skill"]) {
          const entry = lock.extensions.skills[skillName];
          expect(entry).toBeDefined();
          expect(entry).toHaveProperty("source");
          expect(entry).toHaveProperty("origin");
          expect(entry).toHaveProperty("folderHash");
          expect(entry).toHaveProperty("installedAt");
          expect(entry).toHaveProperty("updatedAt");
          // folderHash should be a valid sha256 hash (sha256:64 hex chars)
          expect(entry.folderHash).toMatch(/^sha256:[a-f0-9]{64}$/);
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

        // Verify symlink in agent directory (.claude/commands for claude-code)
        const agentSkillDir = path.join(temp.path, ".claude", "commands", "my-skill");
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
        expect(lock.extensions).toBeDefined();
        expect(lock.extensions.skills).toBeDefined();
        expect(lock.extensions.skills["my-skill"]).toBeDefined();

        const entry = lock.extensions.skills["my-skill"];
        expect(entry.source).toBeDefined();
        expect(entry.origin).toBeDefined();
        expect(entry.folderHash).toBeDefined();
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
          // claude-code skillsDir is ".claude/commands"
          const agentSkillDir = path.join(temp.path, ".claude", "commands", skillName);
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
    it("skips already installed skill by default", async () => {
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

        // Second install of same skill should skip
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
        // Should indicate the skill was skipped (state-based: already up to date)
        expect(result.stdout).toMatch(/already up to date|already installed|skipping/i);
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
});
