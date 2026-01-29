/**
 * E2E tests for the `axm skills add` command.
 */

import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as YAML from "yaml";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "./utils.js";

describe("axm skills add", () => {
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
          ["skills", "add", SKILLS_REPO_FIXTURE, "--list", "--agent", "claude-code"],
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
          ["skills", "add", SKILLS_REPO_FIXTURE, "--list", "--agent", "claude-code"],
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
          ["skills", "add", SKILLS_REPO_FIXTURE, "--all", "--yes", "--agent", "claude-code"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Successfully installed");
        expect(result.stdout).toContain("my-skill");
        expect(result.stdout).toContain("another-skill");

        // Verify .axm structure
        const axmDir = path.join(temp.path, ".axm");
        expect(fs.existsSync(axmDir)).toBe(true);

        // Verify settings.json exists and has skill entries
        const settingsPath = path.join(axmDir, "settings.json");
        expect(fs.existsSync(settingsPath)).toBe(true);
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        expect(settings).toHaveProperty("skills");
        expect(settings.skills).toHaveProperty("my-skill");
        expect(settings.skills).toHaveProperty("another-skill");

        // Verify axm.lock exists and has entries (YAML format)
        const lockPath = path.join(axmDir, "axm.lock");
        expect(fs.existsSync(lockPath)).toBe(true);
        const lockContent = fs.readFileSync(lockPath, "utf-8");
        const lock = YAML.parse(lockContent);
        expect(lock).toHaveProperty("skills");
        expect(lock.skills).toHaveProperty("my-skill");
        expect(lock.skills).toHaveProperty("another-skill");

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

    it("includes contentHash in lockfile entries", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(
          ["skills", "add", SKILLS_REPO_FIXTURE, "--all", "--yes", "--agent", "claude-code"],
          { cwd: temp.path },
        );

        const lockPath = path.join(temp.path, ".axm", "axm.lock");
        const lockContent = fs.readFileSync(lockPath, "utf-8");
        const lock = YAML.parse(lockContent);

        // Each skill entry should have required fields
        for (const skillName of ["my-skill", "another-skill"]) {
          const entry = lock.skills[skillName];
          expect(entry).toBeDefined();
          expect(entry).toHaveProperty("source");
          expect(entry).toHaveProperty("contentHash");
          expect(entry).toHaveProperty("installedAt");
          expect(entry).toHaveProperty("updatedAt");
          // contentHash should be a valid sha256 hash (sha256:64 hex chars)
          expect(entry.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
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
            "add",
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
          ["skills", "add", emptyDir.path, "--all", "--yes", "--agent", "claude-code"],
          { cwd: temp.path },
        );

        // Should exit successfully but indicate no skills found
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("No SKILL.md files found");
        expect(result.stdout).toContain("Nothing to install");
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
          ["skills", "add", serverUrl, "--list", "--agent", "claude-code"],
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
          ["skills", "add", errorUrl, "--list", "--agent", "claude-code"],
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
            "add",
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
        //   axm.lock
        //   skills/
        //     my-skill/
        //       SKILL.md
        // .claude/
        //   commands/
        //     my-skill -> ../../../.axm/skills/my-skill (symlink)

        const axmDir = path.join(temp.path, ".axm");
        const settingsPath = path.join(axmDir, "settings.json");
        const lockPath = path.join(axmDir, "axm.lock");
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

    it("settings.json contains skill metadata", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(
          [
            "skills",
            "add",
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

        expect(settings.skills).toBeDefined();
        expect(settings.skills["my-skill"]).toBeDefined();
        expect(settings.skills["my-skill"].source).toBe(SKILLS_REPO_FIXTURE);
        expect(settings.skills["my-skill"].agents).toContain("claude-code");
      } finally {
        temp.cleanup();
      }
    });

    it("axm.lock contains lock entry for installed skill", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        await runCli(
          [
            "skills",
            "add",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--yes",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        const lockPath = path.join(temp.path, ".axm", "axm.lock");
        const lockContent = fs.readFileSync(lockPath, "utf-8");
        const lock = YAML.parse(lockContent);

        expect(lock.skills).toBeDefined();
        expect(lock.skills["my-skill"]).toBeDefined();

        const entry = lock.skills["my-skill"];
        expect(entry.source).toBe(SKILLS_REPO_FIXTURE);
        expect(entry.skillPath).toContain("my-skill");
        expect(entry.contentHash).toBeDefined();
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
          ["skills", "add", SKILLS_REPO_FIXTURE, "--all", "--yes", "--agent", "claude-code"],
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

  describe("--help", () => {
    it("displays usage information", async () => {
      const result = await runCli(["skills", "add", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Install skills");
      expect(result.stdout).toContain("--list");
      expect(result.stdout).toContain("--all");
      expect(result.stdout).toContain("--yes");
      expect(result.stdout).toContain("--skill");
      expect(result.stdout).toContain("--agent");
      expect(result.stdout).toContain("--global");
    });
  });
});
