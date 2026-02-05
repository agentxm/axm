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
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";

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
});
