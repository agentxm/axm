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
  path.join(root, "agent_extensions", "registry", "@agentxm", "skills", "axm", "src", "SKILL.md");

const removeCompatibilityRange = (content: string): string =>
  content
    .split("\n")
    .filter((line) => !line.includes("axm.sh/cli-version-range:"))
    .join("\n");

/** An older official-skill copy outside the selected canonical location. */
const writeStaleCopy = (root: string): void => {
  const staleRoot = path.join(root, "agent_extensions", "agentxm", "@agentxm", "skills", "axm");
  fs.mkdirSync(path.join(staleRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(staleRoot, "skill.json"),
    JSON.stringify({ owner: "@agentxm", type: "skill", name: "axm", version: "0.0.1" }),
  );
  fs.writeFileSync(
    path.join(staleRoot, "src", "SKILL.md"),
    '---\nname: axm\ndescription: Stale copy.\nmetadata:\n  axm.sh/cli-version: "0.0.1"\n  axm.sh/cli-version-range: ">=0.0.1 <0.1.0"\n---\n',
  );
};

interface LintDocument {
  readonly result: {
    readonly findings: ReadonlyArray<{
      readonly ruleId: string;
      readonly path: string;
      readonly displayRoot: string;
    }>;
    readonly axmSkillCompatibility?: {
      readonly status: string;
      readonly recovery: { readonly steps: ReadonlyArray<{ readonly command: string }> };
    };
  };
}

const compatibilityFindings = (document: LintDocument) =>
  document.result.findings.filter(({ ruleId }) => ruleId === "workspace/axm-skill-compatible");

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
      expect(quiet.stdout).toContain("No findings");
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

  it("recovers the selected skill beside a stale copy in the workspace and staged views", async () => {
    const temp = createTempDir("axm-skill-stale-copy-e2e-");
    try {
      initializeGit(temp.path);
      const env = { DO_NOT_TRACK: "1" };
      const setup = await runCli(
        ["setup", "--scope", "project", "--agent", "claude-code", "--yes", "--non-interactive"],
        { cwd: temp.path, env },
      );
      expect(setup.exitCode, `${setup.stderr}\n${setup.stdout}`).toBe(0);
      writeStaleCopy(temp.path);
      const skillPath = skillMdPath(temp.path);
      fs.writeFileSync(skillPath, removeCompatibilityRange(fs.readFileSync(skillPath, "utf8")));
      git(temp.path, ["add", "."]);
      git(temp.path, ["commit", "--quiet", "-m", "fixture"]);
      const lintJson = async (view: "workspace" | "git-index"): Promise<LintDocument> => {
        const run = await runCli(["lint", "--view", view, "--json"], { cwd: temp.path, env });
        return JSON.parse(run.stdout);
      };

      const broken = await lintJson("workspace");
      const [finding, ...others] = compatibilityFindings(broken);
      expect(others).toEqual([]);
      expect(path.resolve(temp.path, finding?.displayRoot ?? "", finding?.path ?? "")).toBe(
        path.dirname(path.dirname(skillPath)),
      );
      const commands = broken.result.axmSkillCompatibility?.recovery.steps.map(
        ({ command }) => command,
      );
      expect(commands).toEqual([
        "axm skills install @agentxm/skills/axm --bundled --preview",
        "axm skills install @agentxm/skills/axm --bundled",
        "axm lint",
      ]);

      const statusBeforePreview = git(temp.path, ["status", "--porcelain"]);
      const preview = await runCli(
        ["skills", "install", "@agentxm/skills/axm", "--bundled", "--preview"],
        { cwd: temp.path, env },
      );
      expect(preview.exitCode, `${preview.stderr}\n${preview.stdout}`).toBe(0);
      expect(git(temp.path, ["status", "--porcelain"])).toBe(statusBeforePreview);

      const apply = await runCli(["skills", "install", "@agentxm/skills/axm", "--bundled"], {
        cwd: temp.path,
        env,
      });
      expect(apply.exitCode, `${apply.stderr}\n${apply.stdout}`).toBe(0);
      const repaired = await lintJson("workspace");
      expect(repaired.result.axmSkillCompatibility?.status).toBe("compatible");
      expect(compatibilityFindings(repaired)).toEqual([]);
      expect(fs.existsSync(path.join(temp.path, "agent_extensions", "agentxm"))).toBe(true);

      // The repair is in the working tree only until it is staged.
      const staged = await lintJson("git-index");
      expect(staged.result.axmSkillCompatibility?.status).toBe("incompatible");
      git(temp.path, ["add", "-A"]);
      const restaged = await lintJson("git-index");
      expect(restaged.result.axmSkillCompatibility?.status).toBe("compatible");

      const statusAfterApply = git(temp.path, ["status", "--porcelain"]);
      const repeat = await runCli(["skills", "install", "@agentxm/skills/axm", "--bundled"], {
        cwd: temp.path,
        env,
      });
      expect(repeat.exitCode, `${repeat.stderr}\n${repeat.stdout}`).toBe(0);
      expect(git(temp.path, ["status", "--porcelain"])).toBe(statusAfterApply);
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

      git(temp.path, ["add", "agent_extensions/registry/@agentxm/skills/axm/src/SKILL.md"]);
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
