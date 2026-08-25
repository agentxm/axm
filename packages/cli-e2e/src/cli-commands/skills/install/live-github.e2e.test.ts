import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli } from "../../../e2e/utils.js";
import { getOutput } from "../../../test-helpers.js";

const LIVE_SMOKE_ENV = "AXM_RUN_GITHUB_SKILL_INSTALL_LIVE_SMOKE";
const QUALITY_MD_SOURCE = "https://github.com/qualitymd/quality.md";
const AGENTS = [
  "claude-code",
  "codex",
  "cursor",
  "github-copilot-cli",
  "amp",
  "antigravity",
  "gemini-cli",
] as const;

const isLiveSmokeEnabled = (env: Readonly<Record<string, string | undefined>>): boolean => {
  const raw = env[LIVE_SMOKE_ENV]?.toLowerCase();
  return raw === "1" || raw === "true";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const expectRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error(`${label} should be an object`);
  }
  return value;
};

const assertSymlink = (workspacePath: string, relativePath: string): void => {
  const targetPath = path.join(workspacePath, relativePath);
  expect(fs.existsSync(targetPath), `${relativePath} should exist`).toBe(true);
  expect(fs.lstatSync(targetPath).isSymbolicLink(), `${relativePath} should be a symlink`).toBe(
    true,
  );
};

describe("quality.md live GitHub install smoke gate", () => {
  it("is disabled by default", () => {
    expect(isLiveSmokeEnabled({})).toBe(false);
  });

  it("accepts true-like opt-in values", () => {
    expect(isLiveSmokeEnabled({ [LIVE_SMOKE_ENV]: "true" })).toBe(true);
    expect(isLiveSmokeEnabled({ [LIVE_SMOKE_ENV]: "1" })).toBe(true);
  });
});

const describeLiveSmoke = isLiveSmokeEnabled(process.env) ? describe : describe.skip;

describeLiveSmoke("quality.md live GitHub install smoke", () => {
  it("installs quality.md into a temporary workspace and materializes configured agents", async () => {
    const temp = createTempDir("axm-quality-md-live-");
    try {
      const setupArgs = [
        "setup",
        "--yes",
        "--scope",
        "project",
        ...AGENTS.flatMap((agent) => ["--agent", agent]),
      ];
      const setupResult = await runCli(setupArgs, {
        cwd: temp.path,
        timeout: 60000,
      });
      expect(setupResult.exitCode, getOutput(setupResult)).toBe(0);

      const installResult = await runCli(
        ["skills", "install", QUALITY_MD_SOURCE, "--yes", "--debug"],
        {
          cwd: temp.path,
          timeout: 120000,
        },
      );
      expect(installResult.exitCode, getOutput(installResult)).toBe(0);

      const installOutput = getOutput(installResult);
      expect(installOutput).toContain("Installed skill quality for 7 agent targets");
      expect(installOutput).toContain("source: github https://github.com/qualitymd/quality.md");
      expect(installOutput).toContain("dir skills/quality");
      expect(installOutput).toMatch(/tree [0-9a-f]{40}/);

      const canonicalSkillDir = path.join(
        temp.path,
        ".axm",
        "extensions",
        "external",
        "skills",
        "quality",
      );
      expect(fs.existsSync(path.join(canonicalSkillDir, "SKILL.md"))).toBe(true);

      assertSymlink(temp.path, ".agents/skills/quality");
      assertSymlink(temp.path, ".claude/skills/quality");
      assertSymlink(temp.path, ".cursor/skills/quality");
      assertSymlink(temp.path, ".github/skills/quality");

      const settingsPath = path.join(temp.path, "axm.json");
      const settings = expectRecord(JSON.parse(fs.readFileSync(settingsPath, "utf8")), "settings");
      const settingsSkills = expectRecord(settings["skills"], "settings.skills");
      expect(settingsSkills["quality"]).toBe("github:qualitymd/quality.md");

      const lockPath = path.join(temp.path, "axm-lock.yaml");
      const lock = expectRecord(YAML.parse(fs.readFileSync(lockPath, "utf8")), "lockfile");
      const lockSkills = expectRecord(lock["skills"], "lockfile.skills");
      const lockEntry = expectRecord(lockSkills["quality"], "lockfile.skills.quality");
      expect(lockEntry["type"]).toBe("github");
      expect(lockEntry["owner"]).toBe("qualitymd");
      expect(lockEntry["repo"]).toBe("quality.md");
      expect(lockEntry["gitTreeHash"]).toMatch(/^[0-9a-f]{40}$/);

      const secondInstall = await runCli(
        ["skills", "install", QUALITY_MD_SOURCE, "--yes", "--json"],
        {
          cwd: temp.path,
          timeout: 120000,
        },
      );
      expect(secondInstall.exitCode, getOutput(secondInstall)).toBe(0);
      const settingsAfterSecondInstall = expectRecord(
        JSON.parse(fs.readFileSync(settingsPath, "utf8")),
        "settings",
      );
      expect(expectRecord(settingsAfterSecondInstall["skills"], "settings.skills")["quality"]).toBe(
        "github:qualitymd/quality.md",
      );

      const claudeProjection = path.join(temp.path, ".claude", "skills", "quality");
      fs.rmSync(claudeProjection, { recursive: true, force: true });
      expect(fs.existsSync(claudeProjection)).toBe(false);
      const syncResult = await runCli(["sync", "--json"], {
        cwd: temp.path,
        timeout: 120000,
      });
      expect(syncResult.exitCode, getOutput(syncResult)).toBe(0);
      assertSymlink(temp.path, ".claude/skills/quality");

      const listResult = await runCli(["skills", "list"], {
        cwd: temp.path,
        timeout: 60000,
      });
      expect(listResult.exitCode, getOutput(listResult)).toBe(0);
      const listOutput = getOutput(listResult);
      expect(listOutput).toContain("quality");
      expect(listOutput).toContain("github");
      expect(listOutput).toContain("universal");
    } finally {
      temp.cleanup();
    }
  }, 180000);
});
