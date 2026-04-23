/**
 * E2E tests for the `axm skills list` command.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it } from "vitest";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";
import { getOutput } from "../../../test-helpers.js";

describe("axm skills list", () => {
  describe("with skills installed", () => {
    it("lists installed skills", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        // Install skills first
        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes"], {
          cwd: temp.path,
        });

        const result = await runCli(["skills", "list"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);
        const output = getOutput(result);
        expect(output).toContain("my-skill");
        expect(output).toContain("another-skill");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("after partial uninstall", () => {
    it("lists only remaining skills after uninstall", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        // Install both skills
        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes"], {
          cwd: temp.path,
        });

        // Uninstall my-skill (workspace-scoped, removes from all agents)
        await runCli(["skills", "uninstall", "my-skill", "--yes"], {
          cwd: temp.path,
        });

        // List should show only another-skill
        const result = await runCli(["skills", "list"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);
        const output = getOutput(result);
        expect(output).toContain("another-skill");
        expect(output).not.toContain("my-skill");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("alias", () => {
    it("works with ls alias", async () => {
      const temp = createTempDir();
      try {
        await runCli(["setup", "--yes", "--non-interactive"], {
          cwd: temp.path,
        });

        // Install skills first so there's something to list
        await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes"], {
          cwd: temp.path,
        });

        const result = await runCli(["skills", "ls"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);
        expect(getOutput(result)).toContain("my-skill");
      } finally {
        temp.cleanup();
      }
    });
  });
});
