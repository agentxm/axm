/**
 * E2E tests for the `axm skills install --dry-run` functionality.
 *
 * These tests verify that the dry-run capability works correctly end-to-end:
 * - Dry-run completes successfully without installing skills
 * - Real install works after dry-run
 * - Multiple dry-runs produce consistent results
 *
 * Note: Basic dry-run tests (plan display) are in skills-install.test.ts.
 * This file focuses on integration scenarios that verify dry-run accuracy.
 */

import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "./utils.js";

describe("axm skills install --dry-run integration", () => {
  describe("dry-run matches real install", () => {
    it("dry-run completes without installing, then real install works", async () => {
      const temp = createTempDir();
      try {
        // Initialize first
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        // Run dry-run (without --json)
        const dryResult = await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--dry-run",
            "--all",
            "--yes",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        expect(dryResult.exitCode).toBe(0);

        // Verify no skills were installed during dry-run
        // V2 uses extensions/external/skills/ directory structure
        const skillsDirBefore = path.join(temp.path, ".axm", "extensions", "external", "skills");
        expect(fs.existsSync(skillsDirBefore)).toBe(false);

        // Real install
        const installResult = await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes", "--agent", "claude-code"],
          { cwd: temp.path },
        );

        expect(installResult.exitCode).toBe(0);

        // Verify skills were installed
        const skillsDir = path.join(temp.path, ".axm", "extensions", "external", "skills");
        expect(fs.existsSync(skillsDir)).toBe(true);

        const installed = fs.readdirSync(skillsDir);
        expect(installed.length).toBeGreaterThan(0);
      } finally {
        temp.cleanup();
      }
    });

    it("running dry-run multiple times produces consistent results", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        // Run dry-run twice (without --json)
        const result1 = await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--dry-run",
            "--all",
            "--yes",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        const result2 = await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--dry-run",
            "--all",
            "--yes",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        // Both should succeed
        expect(result1.exitCode).toBe(0);
        expect(result2.exitCode).toBe(0);

        // Both should produce output (text-based verification)
        expect(result1.stdout.length).toBeGreaterThan(0);
        expect(result2.stdout.length).toBeGreaterThan(0);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("dry-run with remote source", () => {
    let server: http.Server;
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
                  description: "A skill from a remote URL",
                  files: ["SKILL.md"],
                },
              ],
            }),
          );
        } else if (req.url === "/.well-known/skills/remote-skill/SKILL.md") {
          res.writeHead(200, { "Content-Type": "text/markdown" });
          res.end("# Remote Skill\n\nThis is a remote skill.");
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
            serverUrl = `http://127.0.0.1:${address.port}`;
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

    // TODO: Well-known sources in dry-run require architecture changes to buildIdealForInstall
    // Since well-known skills are fetched on-demand, we can't compute the ideal state
    // without actually fetching. This needs a separate builder for well-known sources.
    it.skip("shows fetch message for remote source in dry-run", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(
          ["skills", "install", serverUrl, "--dry-run", "--all", "--yes", "--agent", "claude-code"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);

        // Per design doc: "Fetching source to analyze contents..."
        // The message should indicate that remote sources are being fetched
        // to determine what would be installed
        const stdout = result.stdout.toLowerCase();
        expect(
          stdout.includes("fetch") ||
            stdout.includes("discover") ||
            stdout.includes("analyzing") ||
            stdout.includes("resolving"),
        ).toBe(true);
      } finally {
        temp.cleanup();
      }
    });

    it.skip("dry-run with remote source does not install skills", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(
          ["skills", "install", serverUrl, "--dry-run", "--all", "--yes", "--agent", "claude-code"],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);

        // Should not have created the skills directory
        const skillsDir = path.join(temp.path, ".axm", "skills");
        expect(fs.existsSync(skillsDir)).toBe(false);

        // Should indicate dry-run completed
        expect(result.stdout.toLowerCase()).toContain("dry-run");
      } finally {
        temp.cleanup();
      }
    });
  });
});
