/**
 * E2E tests for the `axm skills list` command.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it } from "vitest";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";

describe("axm skills list", () => {
  describe("builtin skills only", () => {
    it("lists builtin skills after init", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(["skills", "list"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("axm-manage-skills");
        expect(result.stdout).toContain("builtin");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("with skills installed", () => {
    it("lists installed skills", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        // Install skills first
        await runCli(
          ["skills", "install", SKILLS_REPO_FIXTURE, "--all", "--yes", "--agent", "claude-code"],
          { cwd: temp.path },
        );

        const result = await runCli(["skills", "list"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("my-skill");
        expect(result.stdout).toContain("another-skill");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("--agent filter", () => {
    it("filters skills by agent", async () => {
      const temp = createTempDir();
      try {
        // Initialize with two agents
        await runCli(["init", "--yes", "--agent", "claude-code", "--agent", "cursor"], {
          cwd: temp.path,
        });

        // Install both skills to both agents
        await runCli(
          [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--all",
            "--yes",
            "--agent",
            "claude-code",
            "--agent",
            "cursor",
          ],
          { cwd: temp.path },
        );

        // Uninstall my-skill from cursor to create asymmetry
        await runCli(["skills", "uninstall", "my-skill", "--yes", "--agent", "cursor"], {
          cwd: temp.path,
        });

        // List with --agent cursor should show only another-skill
        const result = await runCli(["skills", "list", "--agent", "cursor"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("another-skill");
        expect(result.stdout).not.toContain("my-skill");

        // List with --agent claude-code should show both skills
        const result2 = await runCli(["skills", "list", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        expect(result2.exitCode).toBe(0);
        expect(result2.stdout).toContain("my-skill");
        expect(result2.stdout).toContain("another-skill");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("alias", () => {
    it("works with ls alias", async () => {
      const temp = createTempDir();
      try {
        await runCli(["init", "--yes", "--agent", "claude-code"], {
          cwd: temp.path,
        });

        const result = await runCli(["skills", "ls"], {
          cwd: temp.path,
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("axm-manage-skills");
      } finally {
        temp.cleanup();
      }
    });
  });
});
