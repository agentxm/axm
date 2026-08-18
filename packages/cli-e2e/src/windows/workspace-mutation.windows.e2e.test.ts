import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli as runBaseCli, SKILLS_REPO_FIXTURE } from "../utils.js";

const runCli = (args: ReadonlyArray<string>, options?: Parameters<typeof runBaseCli>[1]) =>
  runBaseCli([...args, "--verbose"], options);

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
        await runCli(["agents", "add", "--detected", "--yes", "--json", "--non-interactive"], {
          cwd: workspace.path,
          env,
        }),
      );
      expect(JSON.parse(detected.stdout)).toMatchObject({ ok: true });
      expect(readJson(path.join(workspace.path, ".axm", "settings.json"))).toMatchObject({
        agents: expect.arrayContaining(["claude-code", "codex", "codearts-agent"]),
      });

      const projectMcp = expectSuccess(
        await runCli(
          [
            "mcps",
            "add",
            "windows-demo",
            "--command",
            "node server.js",
            "--yes",
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
      expectSuccess(
        await runCli(
          [
            "mcps",
            "add",
            "windows-user-demo",
            "--scope",
            "user",
            "--command",
            "node user-server.js",
            "--yes",
            "--json",
            "--non-interactive",
          ],
          { cwd: workspace.path, env },
        ),
      );
      const hermesConfig = path.join(userHome, ".hermes", "config.yaml");
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
            "--yes",
            "--json",
            "--non-interactive",
          ],
          { cwd: workspace.path, env },
        ),
      );
      expect(YAML.parse(fs.readFileSync(hermesConfig, "utf8"))).not.toMatchObject({
        mcp_servers: { "windows-user-demo": expect.anything() },
      });

      const install = expectSuccess(
        await runCli(
          [
            "skills",
            "install",
            source,
            "--skill",
            "my-skill",
            "--yes",
            "--json",
            "--non-interactive",
          ],
          { cwd: workspace.path, env },
        ),
      );
      expect(JSON.parse(install.stdout)).toMatchObject({ ok: true });
      const canonicalSkill = path.join(
        workspace.path,
        ".axm",
        "extensions",
        "external",
        "skills",
        "my-skill",
      );
      const claudeSkill = path.join(workspace.path, ".claude", "skills", "my-skill");
      const codexSkill = path.join(workspace.path, ".agents", "skills", "my-skill");
      const codeartsSkill = path.join(workspace.path, ".codeartsdoer", "skills", "my-skill");
      expect(fs.existsSync(canonicalSkill)).toBe(true);
      expect(fs.existsSync(claudeSkill)).toBe(true);
      expect(fs.existsSync(codexSkill)).toBe(true);
      expect(fs.existsSync(codeartsSkill)).toBe(true);

      const lockPath = path.join(workspace.path, ".axm", "axm-lock.yaml");
      const lockBytesBefore = fs.readFileSync(lockPath, "utf8");
      const lockBefore = YAML.parse(lockBytesBefore);
      const canonicalBytesBefore = fs.readFileSync(path.join(canonicalSkill, "SKILL.md"), "utf8");
      fs.appendFileSync(path.join(source, "my-skill", "SKILL.md"), "\nWindows refresh.\n");

      const blockedProjectionRoot = path.dirname(codeartsSkill);
      fs.rmSync(blockedProjectionRoot, { recursive: true, force: true });
      fs.writeFileSync(blockedProjectionRoot, "injected projection failure\n");
      const failedUpdate = await runCli(
        ["skills", "update", "--name", "my-skill", "--yes", "--json", "--non-interactive"],
        { cwd: workspace.path, env },
      );
      expect(failedUpdate.exitCode).not.toBe(0);
      expect(fs.readFileSync(path.join(canonicalSkill, "SKILL.md"), "utf8")).toBe(
        canonicalBytesBefore,
      );
      expect(fs.readFileSync(lockPath, "utf8")).toBe(lockBytesBefore);
      expect(fs.readFileSync(blockedProjectionRoot, "utf8")).toBe("injected projection failure\n");

      fs.rmSync(blockedProjectionRoot, { force: true });
      fs.mkdirSync(blockedProjectionRoot, { recursive: true });
      expectSuccess(
        await runCli(
          ["skills", "update", "--name", "my-skill", "--yes", "--json", "--non-interactive"],
          { cwd: workspace.path, env },
        ),
      );
      const lockAfter = YAML.parse(fs.readFileSync(lockPath, "utf8"));
      expect(lockAfter.skills["my-skill"].contentIdentity).not.toBe(
        lockBefore.skills["my-skill"].contentIdentity,
      );
      expect(fs.readFileSync(path.join(canonicalSkill, "SKILL.md"), "utf8")).toContain(
        "Windows refresh.",
      );

      expectSuccess(
        await runCli(["skills", "disable", "my-skill", "--yes", "--json", "--non-interactive"], {
          cwd: workspace.path,
          env,
        }),
      );
      expect(fs.existsSync(canonicalSkill)).toBe(true);
      expect(fs.existsSync(claudeSkill)).toBe(false);
      expect(fs.existsSync(codexSkill)).toBe(false);
      expect(fs.existsSync(codeartsSkill)).toBe(false);
      expectSuccess(
        await runCli(["skills", "enable", "my-skill", "--yes", "--json", "--non-interactive"], {
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
      const settingsPath = path.join(workspace.path, ".axm", "settings.json");
      const settingsBeforeFailure = fs.readFileSync(settingsPath, "utf8");
      const instructionSource = path.join(workspace.path, "AGENTS.md");
      const sourceBeforeFailure = fs.readFileSync(instructionSource, "utf8");
      const instructionTarget = path.join(workspace.path, "CLAUDE.md");
      const gitignorePath = path.join(workspace.path, ".gitignore");
      fs.rmSync(gitignorePath, { recursive: true, force: true });
      fs.mkdirSync(gitignorePath);

      const failedEnable = await runCli(["instructions", "enable", "--json", "--non-interactive"], {
        cwd: workspace.path,
        env,
      });
      expect(failedEnable.exitCode).not.toBe(0);
      expect(fs.readFileSync(settingsPath, "utf8")).toBe(settingsBeforeFailure);
      expect(fs.readFileSync(instructionSource, "utf8")).toBe(sourceBeforeFailure);
      expect(fs.existsSync(instructionTarget)).toBe(false);

      fs.rmSync(gitignorePath, { recursive: true, force: true });
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
        await runCli(["skills", "uninstall", "my-skill", "--yes", "--json", "--non-interactive"], {
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
        result: { outcome: "no-op", reconciliationRequired: false },
      });
    } finally {
      workspace.cleanup();
    }
  });
});
