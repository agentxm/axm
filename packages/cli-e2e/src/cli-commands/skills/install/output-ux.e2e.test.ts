import { describe, expect, it } from "vitest";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";
import { getOutput } from "../../../test-helpers.js";

describe("axm skills install output UX", () => {
  it("summarizes multi-agent human output by target count", async () => {
    const temp = createTempDir();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], {
        cwd: temp.path,
      });

      const result = await runCli(
        ["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"],
        {
          cwd: temp.path,
        },
      );

      expect(result.exitCode).toBe(0);
      const output = getOutput(result);
      expect(output).toContain("Installed skill my-skill for 2 agents");
      expect(output).toContain("-> 2 agent targets");
      expect(output).toContain("1 file");
      expect(output).not.toContain("skill(s)");
    } finally {
      temp.cleanup();
    }
  });

  it("reports every materialized agent target in JSON output", async () => {
    const temp = createTempDir();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code", "--agent", "cursor"], {
        cwd: temp.path,
      });

      const result = await runCli(
        ["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes", "--json"],
        {
          cwd: temp.path,
        },
      );

      expect(result.exitCode).toBe(0);
      const document = JSON.parse(result.stdout);
      const step = document.result.steps[0];
      expect(document.result.outcome).toBe("applied");
      expect(document.result.appliedCount).toBe(1);
      expect(step.status).toBe("applied");
      expect(step.artifact.change).toBe("created");
      expect(step.artifact.targets).toEqual([
        { path: ".agents/skills/my-skill", change: "created" },
        { path: ".claude/skills/my-skill", change: "created" },
        { path: ".cursor/skills/my-skill", change: "created" },
      ]);
    } finally {
      temp.cleanup();
    }
  });

  it("reports idempotent reinstall as unchanged in JSON output", async () => {
    const temp = createTempDir();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], {
        cwd: temp.path,
      });

      await runCli(
        ["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes", "--json"],
        {
          cwd: temp.path,
        },
      );

      const result = await runCli(
        ["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes", "--json"],
        {
          cwd: temp.path,
        },
      );

      expect(result.exitCode).toBe(0);
      const document = JSON.parse(result.stdout);
      const step = document.result.steps[0];
      expect(document.result.outcome).toBe("no-op");
      expect(document.result.appliedCount).toBe(0);
      expect(step.status).toBe("unchanged");
      expect(step.artifact.change).toBe("unchanged");
      expect(step.artifact.targets).toEqual([
        { path: ".agents/skills/my-skill", change: "unchanged" },
        { path: ".claude/skills/my-skill", change: "unchanged" },
      ]);
    } finally {
      temp.cleanup();
    }
  });

  it("announces no-arg install as configured-skill reinstall", async () => {
    const temp = createTempDir();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], {
        cwd: temp.path,
      });

      const result = await runCli(["skills", "install", "--yes"], {
        cwd: temp.path,
      });

      expect(result.exitCode).toBe(0);
      expect(getOutput(result)).toContain("configured skill");
    } finally {
      temp.cleanup();
    }
  });
});
