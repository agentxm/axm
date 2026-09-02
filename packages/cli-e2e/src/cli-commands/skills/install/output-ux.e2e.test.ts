import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";
import { getOutput } from "../../../test-helpers.js";

/**
 * Binds this file's evidence to the requirement identities it executes at the
 * process boundary. The literal shape is read by the specification catalog.
 */
export const executionBinding = {
  requirements: ["cli/install/machine-result-is-schema-backed"],
  boundary: "process",
  rationale:
    "Observes the real process stdout document and stderr diagnostics of the shipped CLI, which the in-memory renderer capture cannot prove.",
} as const;

describe("axm skills install output UX", () => {
  it("warns when an install reaches no configured coding agents", async () => {
    const temp = createTempDir();
    try {
      await runCli(["setup", "--yes", "--scope", "project", "--agent", "claude-code"], {
        cwd: temp.path,
      });
      const settingsPath = path.join(temp.path, "axm.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      fs.writeFileSync(settingsPath, JSON.stringify({ ...settings, agents: [] }, undefined, 2));

      const result = await runCli(
        ["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"],
        { cwd: temp.path },
      );

      expect(result.exitCode).toBe(0);
      const output = getOutput(result);
      expect(output).toContain("Agents: none");
      expect(output).toContain("No coding-agent targets were materialized");
      expect(output).toContain("axm agents add --detected");
    } finally {
      temp.cleanup();
    }
  });

  it("C-27: summarizes human output outcome-first by recipient agents and distinct locations", async () => {
    const temp = createTempDir();
    try {
      await runCli(
        [
          "setup",
          "--yes",
          "--scope",
          "project",
          "--agent",
          "antigravity",
          "--agent",
          "amp",
          "--agent",
          "claude-code",
        ],
        {
          cwd: temp.path,
        },
      );

      const result = await runCli(
        ["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"],
        {
          cwd: temp.path,
        },
      );

      expect(result.exitCode).toBe(0);
      const output = getOutput(result);
      const headline = "Installed 1 skill";
      const unitRow =
        "my-skill   created   1 file   .agents/skills/my-skill, .claude/skills/my-skill";
      expect(output).toContain(headline);
      expect(output).toContain(unitRow);
      expect(output.indexOf(headline)).toBeLessThan(output.indexOf(unitRow));
      expect(output).toContain("Agents: antigravity, amp, claude-code");
      expect(output).not.toContain("skill(s)");
    } finally {
      temp.cleanup();
    }
  });

  it("C-32: reports recipient agents and materialized locations in one JSON document", async () => {
    const temp = createTempDir();
    try {
      await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--agent", "cursor"],
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
      expect(document.ok).toBe(true);
      expect(document.result.contract).toBe("plan-result-v3");
      expect(document.result.outcome).toBe("applied");
      expect(document.result.mode).toBe("apply");
      expect(document.result.counts).toEqual({
        total: 1,
        planned: 0,
        ready: 0,
        committed: 1,
        unchanged: 0,
        failed: 0,
        rolledBack: 0,
        blocked: 0,
        skipped: 0,
        cancelled: 0,
        interrupted: 0,
        warnings: 0,
      });
      expect(document.result.units).toHaveLength(1);
      const unit = document.result.units[0];
      expect(unit.label).toBe("my-skill");
      expect(unit.state).toBe("committed");
      expect(unit.artifact.change).toBe("created");
      expect(unit.artifact.agents).toEqual(["claude-code", "cursor"]);
      expect(unit.artifact.path).toBe(".agents/skills/my-skill");
      expect(unit.artifact.targets).toEqual([
        { path: ".claude/skills/my-skill", change: "created", agentIds: ["claude-code"] },
        { path: ".cursor/skills/my-skill", change: "created", agentIds: ["cursor"] },
      ]);
      expect(document.result.agentCoverage).toEqual({
        scope: "project",
        agents: ["claude-code", "cursor"],
      });
    } finally {
      temp.cleanup();
    }
  });

  it("dedupes shared universal locations in JSON output", async () => {
    const temp = createTempDir();
    try {
      await runCli(
        [
          "setup",
          "--yes",
          "--scope",
          "project",
          "--agent",
          "antigravity",
          "--agent",
          "amp",
          "--agent",
          "claude-code",
        ],
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
      expect(document.result.outcome).toBe("applied");
      const unit = document.result.units[0];
      expect(unit.state).toBe("committed");
      expect(unit.artifact.agents).toEqual(["antigravity", "amp", "claude-code"]);
      expect(unit.artifact.path).toBe(".agents/skills/my-skill");
      expect(unit.artifact.targets).toEqual([
        { path: ".claude/skills/my-skill", change: "created", agentIds: ["claude-code"] },
      ]);
    } finally {
      temp.cleanup();
    }
  });

  it("C-13: reports idempotent reinstall as unchanged in JSON output", async () => {
    const temp = createTempDir();
    try {
      await runCli(["setup", "--yes", "--scope", "project", "--agent", "claude-code"], {
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
      expect(document.ok).toBe(true);
      expect(document.result.contract).toBe("plan-result-v3");
      expect(document.result.outcome).toBe("no-op");
      expect(document.result.counts).toEqual({
        total: 1,
        planned: 0,
        ready: 0,
        committed: 0,
        unchanged: 1,
        failed: 0,
        rolledBack: 0,
        blocked: 0,
        skipped: 0,
        cancelled: 0,
        interrupted: 0,
        warnings: 0,
      });
      const unit = document.result.units[0];
      expect(unit.state).toBe("unchanged");
      expect(unit.artifact.change).toBe("unchanged");
      expect(unit.artifact.agents).toEqual(["claude-code"]);
      expect(unit.artifact.path).toBe(".agents/skills/my-skill");
      expect(unit.artifact.targets).toEqual([
        { path: ".claude/skills/my-skill", change: "unchanged", agentIds: ["claude-code"] },
      ]);
    } finally {
      temp.cleanup();
    }
  });

  it("reinstalls configured skills when no source argument is provided", async () => {
    const temp = createTempDir();
    try {
      await runCli(["setup", "--yes", "--scope", "project", "--agent", "claude-code"], {
        cwd: temp.path,
      });

      const bundledUninstall = await runCli(["skills", "uninstall", "axm", "--yes"], {
        cwd: temp.path,
      });
      expect(bundledUninstall.exitCode).toBe(0);

      const initialInstall = await runCli(
        ["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"],
        { cwd: temp.path },
      );
      expect(initialInstall.exitCode).toBe(0);

      const result = await runCli(["skills", "install", "--yes"], {
        cwd: temp.path,
      });

      expect(result.exitCode).toBe(0);
      const output = getOutput(result);
      expect(output).toContain("Already up to date — 1 skill");
      expect(output).toContain("1 skill already current");
    } finally {
      temp.cleanup();
    }
  });
});
