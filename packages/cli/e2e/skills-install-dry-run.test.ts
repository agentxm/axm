/**
 * E2E tests for the `axm skills install --dry-run` functionality.
 *
 * These tests verify that the dry-run capability works correctly end-to-end:
 * - Dry-run plan matches what real install actually does
 * - Remote sources show appropriate fetch message
 *
 * Note: Basic dry-run tests (plan display, JSON structure) are in skills-install.test.ts.
 * This file focuses on integration scenarios that verify dry-run accuracy.
 */

import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "./utils.js";

describe("axm skills install --dry-run integration", () => {
  describe("dry-run matches real install", () => {
    it("installed skills match dry-run plan", async () => {
      const temp = createTempDir();
      try {
        // Initialize first
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        // Get dry-run plan
        const dryResult = await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--dry-run",
            "--all",
            "--yes",
            "--json",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        expect(dryResult.exitCode).toBe(0);
        const plan = JSON.parse(dryResult.stdout);

        // Get the skills that would be added from dry-run plan
        const plannedAdds = plan.changes
          .filter((c: { _tag: string }) => c._tag === "Add")
          .map((c: { name: string }) => c.name)
          .sort();

        // Verify no skills were installed during dry-run
        const skillsDirBefore = path.join(temp.path, ".axm", "skills");
        expect(fs.existsSync(skillsDirBefore)).toBe(false);

        // Real install
        const installResult = await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes", "--agent", "claude-code"],
          { cwd: temp.path },
        );

        expect(installResult.exitCode).toBe(0);

        // Verify installed skills match the plan
        const skillsDir = path.join(temp.path, ".axm", "skills");
        expect(fs.existsSync(skillsDir)).toBe(true);

        const installed = fs.readdirSync(skillsDir).sort();

        expect(installed).toEqual(plannedAdds);
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

        // Run dry-run twice
        const result1 = await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--dry-run",
            "--all",
            "--yes",
            "--json",
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
            "--json",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        expect(result1.exitCode).toBe(0);
        expect(result2.exitCode).toBe(0);

        const plan1 = JSON.parse(result1.stdout);
        const plan2 = JSON.parse(result2.stdout);

        // Plans should have the same changes (in potentially different order)
        const names1 = plan1.changes.map((c: { name: string }) => c.name).sort();
        const names2 = plan2.changes.map((c: { name: string }) => c.name).sort();

        expect(names1).toEqual(names2);
        expect(plan1.summary).toEqual(plan2.summary);
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

    it.skip("dry-run JSON output includes remote skill in plan", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(
          [
            "skills",
            "install",
            serverUrl,
            "--dry-run",
            "--all",
            "--yes",
            "--json",
            "--agent",
            "claude-code",
          ],
          { cwd: temp.path },
        );

        expect(result.exitCode).toBe(0);

        const plan = JSON.parse(result.stdout);
        expect(plan.changes).toBeDefined();
        expect(Array.isArray(plan.changes)).toBe(true);

        // Should have the remote skill in the plan
        const remoteSkillChange = plan.changes.find(
          (c: { name: string }) => c.name === "remote-skill",
        );
        expect(remoteSkillChange).toBeDefined();
        expect(remoteSkillChange._tag).toBe("Add");
      } finally {
        temp.cleanup();
      }
    });
  });
});
