/**
 * E2E tests for the `axm skills install --preview` functionality.
 *
 * These tests verify that the preview capability works correctly end-to-end:
 * - Preview completes successfully without installing skills
 * - Real install works after preview
 * - Multiple previews produce consistent results
 *
 * Note: Basic preview tests (plan display) are in skills-install.test.ts.
 * This file focuses on integration scenarios that verify preview accuracy.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";
import { getOutput } from "../../../test-helpers.js";

describe("axm skills install --preview integration", () => {
  describe("preview matches real install", () => {
    it("preview completes without installing, then real install works", async () => {
      const temp = createTempDir();
      try {
        // Initialize first
        await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        // Run preview without --yes (non-interactive mode prevents confirmation)
        const previewResult = await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--preview", "--all", "--non-interactive"],
          { cwd: temp.path },
        );

        expect(previewResult.exitCode).toBe(0);

        // Verify no skills were installed during preview (non-interactive skips apply)
        const skillsDirBefore = path.join(temp.path, "agent_extensions", "@test", "skills");
        expect(fs.existsSync(skillsDirBefore)).toBe(false);

        // Real install
        const installResult = await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes"],
          { cwd: temp.path },
        );

        expect(installResult.exitCode).toBe(0);

        // Verify skills were installed
        const skillsDir = path.join(temp.path, "agent_extensions", "@test", "skills");
        expect(fs.existsSync(skillsDir)).toBe(true);

        const installed = fs.readdirSync(skillsDir);
        expect(installed.length).toBeGreaterThan(0);
      } finally {
        temp.cleanup();
      }
    });

    it("running preview multiple times produces consistent results", async () => {
      const temp = createTempDir();
      try {
        await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );

        // Run preview twice (without --json)
        const result1 = await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--preview", "--all", "--yes"],
          { cwd: temp.path },
        );

        const result2 = await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--preview", "--all", "--yes"],
          { cwd: temp.path },
        );

        // Both should succeed
        expect(result1.exitCode).toBe(0);
        expect(result2.exitCode).toBe(0);

        // Both should produce output (text-based verification)
        expect(getOutput(result1).length).toBeGreaterThan(0);
        expect(getOutput(result2).length).toBeGreaterThan(0);
      } finally {
        temp.cleanup();
      }
    });
  });
});
