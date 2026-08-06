/**
 * E2E tests for the `axm skills list` inventory command.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";
import { getOutput } from "../../../test-helpers.js";

describe("axm skills list", () => {
  it("inventories unmanaged user skills without settings or a lockfile", async () => {
    const userHome = createTempDir("axm-skills-list-user-home-");
    const emptyHome = createTempDir("axm-skills-list-empty-home-");
    try {
      const skillDir = path.join(userHome.path, ".agents", "skills", "native-only");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Native only\n");

      const textResult = await runCli(["skills", "list", "--scope", "user"], {
        cwd: userHome.path,
        env: {
          AXM_USER_HOME: userHome.path,
          HOME: emptyHome.path,
        },
      });
      const result = await runCli(["skills", "list", "--scope", "user", "--json"], {
        cwd: userHome.path,
        env: {
          AXM_USER_HOME: userHome.path,
          HOME: emptyHome.path,
        },
      });

      expect(textResult.exitCode, getOutput(textResult)).toBe(0);
      expect(textResult.stdout).toBe("");
      expect(textResult.stderr).toContain("native-only");
      expect(textResult.stderr).toContain("unmanaged");
      expect(textResult.stderr).toContain("1 installed");
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: true,
        result: {
          count: 1,
          configuredCount: 0,
          implicitCount: 0,
          installedCount: 1,
          unmanagedCount: 1,
          items: [
            {
              name: "native-only",
              classification: { kind: "lifecycle", lifecycle: "unmanaged" },
            },
          ],
        },
      });
    } finally {
      userHome.cleanup();
      emptyHome.cleanup();
    }
  });

  it("reports an existing malformed settings source", async () => {
    const temp = createTempDir();
    try {
      fs.mkdirSync(path.join(temp.path, ".axm"), { recursive: true });
      fs.writeFileSync(path.join(temp.path, ".axm", "settings.json"), "{ not-json");

      const result = await runCli(["skills", "list", "--json"], { cwd: temp.path });

      expect(result.exitCode).not.toBe(0);
    } finally {
      temp.cleanup();
    }
  });

  it("degrades to declared state when the lockfile is malformed", async () => {
    const temp = createTempDir();
    try {
      fs.mkdirSync(path.join(temp.path, ".axm"), { recursive: true });
      fs.writeFileSync(
        path.join(temp.path, ".axm", "settings.json"),
        `${JSON.stringify({ agents: [] }, null, 2)}\n`,
      );
      fs.writeFileSync(path.join(temp.path, ".axm", "axm-lock.yaml"), "lockfileVersion: invalid\n");

      const result = await runCli(["skills", "list", "--json"], { cwd: temp.path });

      // A user whose lockfile is corrupt still needs to see what their
      // workspace declares in order to understand what broke.
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("workspace lockfile could not be read");
    } finally {
      temp.cleanup();
    }
  });

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
