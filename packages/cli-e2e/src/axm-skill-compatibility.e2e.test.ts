import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli, withoutLocalGitEnvironment } from "./e2e/utils.js";

const git = (root: string, args: ReadonlyArray<string>): string =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...withoutLocalGitEnvironment(process.env),
      GIT_TERMINAL_PROMPT: "0",
    },
  });

const initializeGit = (root: string): void => {
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
};

const skillMdPath = (root: string): string =>
  path.join(root, "agent_extensions", "agentxm", "@agentxm", "skills", "axm", "src", "SKILL.md");

const removeCompatibilityRange = (content: string): string =>
  content
    .split("\n")
    .filter((line) => !line.includes("axm.sh/cli-version-range:"))
    .join("\n");

describe("AXM skill compatibility lifecycle", () => {
  it("accepts a compatible bundled pair in human, JSON, quiet, and no-color lint modes", async () => {
    const temp = createTempDir("axm-skill-compatibility-e2e-");
    try {
      const env = { DO_NOT_TRACK: "1" };
      const setup = await runCli(
        ["setup", "--scope", "project", "--agent", "claude-code", "--yes", "--non-interactive"],
        { cwd: temp.path, env },
      );
      expect(setup.exitCode, `${setup.stderr}\n${setup.stdout}`).toBe(0);

      const human = await runCli(["lint", "--strict"], { cwd: temp.path, env });
      expect(human.exitCode, `${human.stderr}\n${human.stdout}`).toBe(0);

      const json = await runCli(["lint", "--strict", "--json"], { cwd: temp.path, env });
      expect(json.exitCode, `${json.stderr}\n${json.stdout}`).toBe(0);
      const document = JSON.parse(json.stdout);
      expect(document.result.findings).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: "workspace/axm-skill-compatible" }),
        ]),
      );

      const quiet = await runCli(["lint", "--strict", "--quiet"], { cwd: temp.path, env });
      expect(quiet.exitCode).toBe(0);
      expect(quiet.stdout).toBe("");
      expect(quiet.stderr).not.toContain("Loading project workspace");

      const noColor = await runCli(["lint", "--strict"], {
        cwd: temp.path,
        env: { ...env, NO_COLOR: "1" },
      });
      expect(noColor.exitCode).toBe(0);
      expect(noColor.stdout + noColor.stderr).not.toContain("\u001b[");
    } finally {
      temp.cleanup();
    }
  });

  it("blocks strict lint for incompatible live and staged skill bytes", async () => {
    const temp = createTempDir("axm-skill-incompatible-e2e-");
    try {
      initializeGit(temp.path);
      const env = { DO_NOT_TRACK: "1" };
      const setup = await runCli(
        ["setup", "--scope", "project", "--agent", "claude-code", "--yes", "--non-interactive"],
        { cwd: temp.path, env },
      );
      expect(setup.exitCode, `${setup.stderr}\n${setup.stdout}`).toBe(0);
      git(temp.path, ["add", "."]);
      git(temp.path, ["commit", "--quiet", "-m", "fixture"]);

      const skillPath = skillMdPath(temp.path);
      const compatible = fs.readFileSync(skillPath, "utf8");
      const incompatible = removeCompatibilityRange(compatible);
      expect(incompatible).not.toBe(compatible);
      fs.writeFileSync(skillPath, incompatible);

      const lint = await runCli(["lint", "--strict", "--json"], {
        cwd: temp.path,
        env,
      });
      expect(lint.exitCode).toBe(1);
      expect(JSON.parse(lint.stdout).result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: "workspace/axm-skill-compatible",
            severity: "error",
          }),
        ]),
      );

      git(temp.path, ["add", "agent_extensions/agentxm/@agentxm/skills/axm/src/SKILL.md"]);
      fs.writeFileSync(skillPath, compatible);
      const live = await runCli(["lint", "--strict", "--json"], {
        cwd: temp.path,
        env,
      });
      expect(live.exitCode, `${live.stderr}\n${live.stdout}`).toBe(0);

      const staged = await runCli(["lint", "--view", "git-index", "--strict", "--json"], {
        cwd: temp.path,
        env,
      });
      expect(staged.exitCode).toBe(1);
      const stagedFindings: Array<{ ruleId: string }> = JSON.parse(staged.stdout).result.findings;
      expect(stagedFindings.map((finding) => finding.ruleId)).toContain(
        "workspace/axm-skill-compatible",
      );
      expect(fs.readFileSync(skillPath, "utf8")).toBe(compatible);
    } finally {
      temp.cleanup();
    }
  });
});
