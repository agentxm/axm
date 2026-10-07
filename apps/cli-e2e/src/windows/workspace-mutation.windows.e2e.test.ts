import "../cli-commands/subagents/implementations.e2e.js";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { withoutLocalGitEnvironment } from "@agentxm/client-e2e-utils";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli as runBaseCli, SKILLS_REPO_FIXTURE } from "../utils.js";

/**
 * Binds this file's evidence to the requirement identities it executes. The
 * literal shape is read by the specification catalog.
 */
export const executionBinding = {
  requirements: [
    "system/compatibility/supported-platform-matrix",
    "cli/lint/observes-selected-filesystem-view",
    "workspace/subagents/native-locations-respect-shape-and-proof",
    "cli/subagents/import/preserves-native-implementation-authority",
  ],
  boundary: "platform",
  rationale:
    "Exercises workspace mutation semantics on a real Windows filesystem, where path, symlink, and lock behavior differ from POSIX.",
} as const;

const runCli = (args: ReadonlyArray<string>, options?: Parameters<typeof runBaseCli>[1]) =>
  runBaseCli(["--verbose", ...args], options);

const expectSuccess = (result: {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}) => {
  expect(result.exitCode, `${result.stderr}\n${result.stdout}`).toBe(0);
  return result;
};

const readJson = (filePath: string): unknown => JSON.parse(fs.readFileSync(filePath, "utf8"));

describe("Windows workspace mutation contract", () => {
  it("lints staged Windows bytes without changing the index or working tree", async () => {
    expect(process.platform).toBe("win32");
    const workspace = createTempDir("axm windows staged view ");
    const home = createTempDir("axm windows user home ");
    const userHome = home.path;
    const env = {
      HOME: userHome,
      USERPROFILE: userHome,
      AXM_USER_HOME: userHome,
      DO_NOT_TRACK: "1",
    };
    fs.mkdirSync(userHome, { recursive: true });
    const git = (args: ReadonlyArray<string>) =>
      execFileSync("git", args, {
        cwd: workspace.path,
        encoding: "utf8",
        env: withoutLocalGitEnvironment(process.env),
      });
    try {
      git(["init", "--quiet", "--initial-branch=main"]);
      git(["config", "user.email", "test@example.com"]);
      git(["config", "user.name", "Test"]);
      expectSuccess(
        await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          { cwd: workspace.path, env },
        ),
      );
      git(["add", "."]);
      git(["commit", "--quiet", "-m", "fixture"]);
      const settingsPath = path.join(workspace.path, "axm.json");
      const validSettings = fs.readFileSync(settingsPath, "utf8");
      const settings: unknown = JSON.parse(validSettings);
      if (typeof settings !== "object" || settings === null || Array.isArray(settings))
        throw new Error("Expected object-valued workspace settings");
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({ ...settings, skills: { demo: "@acme/skills/demo" } }),
      );
      git(["add", "axm.json"]);
      fs.writeFileSync(settingsPath, validSettings);
      const statusBefore = git(["status", "--porcelain=v2", "-z"]);
      const indexBefore = git(["ls-files", "--stage", "-z"]);
      const result = await runCli(["lint", "--view", "git-index", "--json"], {
        cwd: path.join(workspace.path, ".claude"),
        env,
      });
      expect(result.exitCode, `${result.stderr}\n${result.stdout}`).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({
        result: {
          input: {
            view: "git-index",
            fingerprint: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
          },
          findings: expect.arrayContaining([
            expect.objectContaining({
              ruleId: "workspace/skills-lockfile-aligned",
              message: expect.stringContaining("@acme/skills/demo"),
            }),
          ]),
        },
      });
      expect(git(["status", "--porcelain=v2", "-z"])).toBe(statusBefore);
      expect(git(["ls-files", "--stage", "-z"])).toBe(indexBefore);
      expect(fs.readFileSync(settingsPath, "utf8")).toBe(validSettings);
    } finally {
      workspace.cleanup();
      home.cleanup();
    }
  });

  it("preserves lifecycle, native writer, path, lock, and rollback guarantees", async () => {
    expect(process.platform).toBe("win32");
    expect(path.sep).toBe("\\");

    const workspace = createTempDir("axm windows workspace ");
    const userHome = path.join(workspace.path, "user home");
    const source = path.join(workspace.path, "extension source");
    const env = { HOME: userHome, USERPROFILE: userHome, AXM_USER_HOME: userHome };
    fs.mkdirSync(userHome, { recursive: true });
    fs.cpSync(SKILLS_REPO_FIXTURE, source, { recursive: true });

    try {
      expect(path.parse(workspace.path).root).toMatch(/^[A-Za-z]:\\$/u);
      expect(workspace.path).toContain(" ");

      expectSuccess(
        await runCli(
          [
            "setup",
            "--yes",
            "--scope",
            "project",
            "--agent",
            "claude-code",
            "--agent",
            "codex",
            "--json",
            "--non-interactive",
          ],
          { cwd: workspace.path, env },
        ),
      );

      const codeartsDir = path.join(workspace.path, ".codeartsdoer");
      const codeartsConfig = path.join(codeartsDir, "codearts_cli.jsonc");
      fs.mkdirSync(codeartsDir, { recursive: true });
      fs.writeFileSync(codeartsConfig, '{\n  // retained Windows marker\n  "mcp": {}\n}\n');
      const detected = expectSuccess(
        await runCli(["agents", "add", "--detected", "--json", "--non-interactive"], {
          cwd: workspace.path,
          env,
        }),
      );
      expect(JSON.parse(detected.stdout)).toMatchObject({ ok: true });
      expect(readJson(path.join(workspace.path, "axm.json"))).toMatchObject({
        agents: expect.arrayContaining(["claude-code", "codex", "codearts-agent"]),
      });

      const projectMcp = expectSuccess(
        await runCli(
          [
            "mcps",
            "add",
            "windows-demo",
            "--command",
            "node",
            "--arg",
            "server.js",
            "--json",
            "--non-interactive",
          ],
          { cwd: workspace.path, env },
        ),
      );
      expect(JSON.parse(projectMcp.stdout)).toMatchObject({
        ok: true,
        result: { outcome: "applied" },
      });
      expect(readJson(path.join(workspace.path, ".mcp.json"))).toMatchObject({
        mcpServers: { "windows-demo": { command: "node", args: ["server.js"] } },
      });
      expect(fs.readFileSync(path.join(workspace.path, ".codex", "config.toml"), "utf8")).toContain(
        "windows-demo",
      );
      expect(fs.readFileSync(codeartsConfig, "utf8")).toContain("// retained Windows marker");
      expect(fs.readFileSync(codeartsConfig, "utf8")).toContain("windows-demo");

      expectSuccess(
        await runCli(
          ["setup", "--yes", "--scope", "user", "--agent", "hermes", "--json", "--non-interactive"],
          { cwd: workspace.path, env },
        ),
      );
      const hermesConfig = path.join(userHome, ".hermes", "config.yaml");
      expect(fs.existsSync(hermesConfig)).toBe(false);
      expectSuccess(
        await runCli(
          [
            "mcps",
            "add",
            "windows-user-demo",
            "--scope",
            "user",
            "--command",
            "node",
            "--arg",
            "user-server.js",
            "--json",
            "--non-interactive",
          ],
          { cwd: workspace.path, env },
        ),
      );
      expect(YAML.parse(fs.readFileSync(hermesConfig, "utf8"))).toMatchObject({
        mcp_servers: {
          "windows-user-demo": { command: "node", args: ["user-server.js"] },
        },
      });
      expectSuccess(
        await runCli(
          [
            "mcps",
            "uninstall",
            "windows-user-demo",
            "--scope",
            "user",
            "--json",
            "--non-interactive",
          ],
          { cwd: workspace.path, env },
        ),
      );
      expect(fs.existsSync(hermesConfig)).toBe(false);

      const install = expectSuccess(
        await runCli(
          ["skills", "install", source, "--skill", "my-skill", "--json", "--non-interactive"],
          { cwd: workspace.path, env },
        ),
      );
      expect(JSON.parse(install.stdout)).toMatchObject({ ok: true });
      const claudeSkill = path.join(workspace.path, ".claude", "skills", "my-skill");
      const codexSkill = path.join(workspace.path, ".agents", "skills", "my-skill");
      const codeartsSkill = path.join(workspace.path, ".codeartsdoer", "skills", "my-skill");
      const canonicalSkill = path.dirname(fs.realpathSync(claudeSkill));
      const canonicalSkillMd = path.join(canonicalSkill, "src", "SKILL.md");
      expect(fs.existsSync(canonicalSkill)).toBe(true);
      expect(fs.existsSync(claudeSkill)).toBe(true);
      expect(fs.existsSync(codexSkill)).toBe(true);
      expect(fs.existsSync(codeartsSkill)).toBe(true);

      const lockPath = path.join(workspace.path, "axm-lock.yaml");
      const lockBytesBefore = fs.readFileSync(lockPath, "utf8");
      const lockBefore = YAML.parse(lockBytesBefore);
      const canonicalBytesBefore = fs.readFileSync(canonicalSkillMd, "utf8");
      fs.appendFileSync(path.join(source, "my-skill", "src", "SKILL.md"), "\nWindows refresh.\n");

      const blockedProjectionRoot = path.dirname(codeartsSkill);
      fs.rmSync(blockedProjectionRoot, { recursive: true, force: true });
      fs.writeFileSync(blockedProjectionRoot, "injected projection failure\n");
      const failedUpdate = await runCli(
        ["skills", "update", "--name", "my-skill", "--json", "--non-interactive"],
        { cwd: workspace.path, env },
      );
      expect(failedUpdate.exitCode).not.toBe(0);
      expect(fs.readFileSync(canonicalSkillMd, "utf8")).toBe(canonicalBytesBefore);
      expect(fs.readFileSync(lockPath, "utf8")).toBe(lockBytesBefore);
      expect(fs.readFileSync(blockedProjectionRoot, "utf8")).toBe("injected projection failure\n");

      fs.rmSync(blockedProjectionRoot, { force: true });
      fs.mkdirSync(blockedProjectionRoot, { recursive: true });
      expectSuccess(
        await runCli(["skills", "update", "--name", "my-skill", "--json", "--non-interactive"], {
          cwd: workspace.path,
          env,
        }),
      );
      const lockAfter = YAML.parse(fs.readFileSync(lockPath, "utf8"));
      expect(lockAfter.packages[lockAfter.skills["my-skill"].package].treeIntegrity).not.toBe(
        lockBefore.packages[lockBefore.skills["my-skill"].package].treeIntegrity,
      );
      expect(fs.readFileSync(canonicalSkillMd, "utf8")).toContain("Windows refresh.");

      expectSuccess(
        await runCli(["skills", "disable", "my-skill", "--json", "--non-interactive"], {
          cwd: workspace.path,
          env,
        }),
      );
      expect(fs.existsSync(canonicalSkill)).toBe(true);
      expect(fs.existsSync(claudeSkill)).toBe(false);
      expect(fs.existsSync(codexSkill)).toBe(false);
      expect(fs.existsSync(codeartsSkill)).toBe(false);
      expectSuccess(
        await runCli(["skills", "enable", "my-skill", "--json", "--non-interactive"], {
          cwd: workspace.path,
          env,
        }),
      );
      expect(fs.existsSync(claudeSkill)).toBe(true);
      expect(fs.existsSync(codexSkill)).toBe(true);
      expect(fs.existsSync(codeartsSkill)).toBe(true);

      fs.rmSync(claudeSkill, { recursive: true, force: true });
      const preview = expectSuccess(
        await runCli(["sync", "--preview", "--json", "--non-interactive"], {
          cwd: workspace.path,
          env,
        }),
      );
      expect(JSON.parse(preview.stdout)).toMatchObject({ ok: true });
      expect(fs.existsSync(claudeSkill)).toBe(false);
      expectSuccess(
        await runCli(["sync", "--json", "--non-interactive"], {
          cwd: workspace.path,
          env,
        }),
      );
      expect(fs.existsSync(claudeSkill)).toBe(true);

      expectSuccess(
        await runCli(["instructions", "disable", "--json", "--non-interactive"], {
          cwd: workspace.path,
          env,
        }),
      );
      const settingsPath = path.join(workspace.path, "axm.json");
      const settingsBeforeFailure = fs.readFileSync(settingsPath, "utf8");
      const instructionSource = path.join(workspace.path, "AGENTS.md");
      const sourceBeforeFailure = fs.readFileSync(instructionSource, "utf8");
      const instructionTarget = path.join(workspace.path, "CLAUDE.md");
      fs.rmSync(instructionTarget, { recursive: true, force: true });
      fs.mkdirSync(instructionTarget);

      const failedEnable = await runCli(["instructions", "enable", "--json", "--non-interactive"], {
        cwd: workspace.path,
        env,
      });
      expect(failedEnable.exitCode).not.toBe(0);
      expect(fs.readFileSync(settingsPath, "utf8")).toBe(settingsBeforeFailure);
      expect(fs.readFileSync(instructionSource, "utf8")).toBe(sourceBeforeFailure);
      expect(fs.statSync(instructionTarget).isDirectory()).toBe(true);

      fs.rmSync(instructionTarget, { recursive: true, force: true });
      expectSuccess(
        await runCli(["instructions", "enable", "--json", "--non-interactive"], {
          cwd: workspace.path,
          env,
        }),
      );
      expect(fs.existsSync(instructionTarget)).toBe(true);
      const instructionStatus = expectSuccess(
        await runCli(["instructions", "--json", "--non-interactive"], {
          cwd: workspace.path,
          env,
        }),
      );
      expect(JSON.parse(instructionStatus.stdout)).toMatchObject({
        ok: true,
        result: { enabled: true },
      });

      expectSuccess(
        await runCli(["skills", "uninstall", "my-skill", "--json", "--non-interactive"], {
          cwd: workspace.path,
          env,
        }),
      );
      expect(fs.existsSync(canonicalSkill)).toBe(false);
      expect(fs.existsSync(claudeSkill)).toBe(false);
      expect(fs.existsSync(codexSkill)).toBe(false);
      expect(fs.existsSync(codeartsSkill)).toBe(false);
      expect(YAML.parse(fs.readFileSync(lockPath, "utf8")).skills?.["my-skill"]).toBeUndefined();

      const converged = expectSuccess(
        await runCli(["sync", "--preview", "--fail-on-change", "--json", "--non-interactive"], {
          cwd: workspace.path,
          env,
        }),
      );
      expect(JSON.parse(converged.stdout)).toMatchObject({
        ok: true,
        result: { outcome: "no-op" },
      });
    } finally {
      workspace.cleanup();
    }
  });
});
