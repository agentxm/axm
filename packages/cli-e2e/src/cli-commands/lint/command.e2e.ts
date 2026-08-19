/**
 * E2E tests for the `axm lint` command.
 *
 * Phase 7 acceptance — these tests spawn the packaged CLI binary via
 * `runCli()` in a temp workspace and exercise the full end-to-end contract:
 *
 * - 7.6: stale workspace artifacts + missing lockfile + declared skill
 *        produce expected error findings.
 * - 7.8: `axm lint --scope user` runs against `$AXM_USER_HOME`; the
 *        `workspace/agents-detected-declared` rule is suppressed in the
 *        user scope.
 * - 7.9: `axm lint --strict` flips the exit code when only warnings remain.
 * - 7.10: `axm doctor` and `axm sync` return non-zero with an
 *        `Unknown subcommand` substring.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { createTempDir, runCli } from "../../e2e/utils.js";

const writeJson = (file: string, value: unknown): void => {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
};

const GIT_REPOSITORY_ENVIRONMENT_VARIABLES = new Set([
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_CONFIG",
  "GIT_CONFIG_COUNT",
  "GIT_CONFIG_PARAMETERS",
  "GIT_DIR",
  "GIT_GRAFT_FILE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_OBJECT_DIRECTORY",
  "GIT_PREFIX",
  "GIT_REPLACE_REF_BASE",
  "GIT_SHALLOW_FILE",
  "GIT_WORK_TREE",
]);

const isolatedGitEnvironment = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && !GIT_REPOSITORY_ENVIRONMENT_VARIABLES.has(entry[0]),
    ),
  );

const git = (root: string, args: ReadonlyArray<string>): string =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: { ...isolatedGitEnvironment(), GIT_TERMINAL_PROMPT: "0" },
  });

const initializeGit = (root: string): void => {
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
};

const writeUnmanagedSkill = (root: string, name: string, description = "E2E skill"): void => {
  const skillRoot = path.join(root, ".claude", "skills", name);
  fs.mkdirSync(skillRoot, { recursive: true });
  fs.writeFileSync(
    path.join(skillRoot, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
  );
};

const sharedMcpPairs = [
  {
    label: "Claude Code and GitHub Copilot CLI",
    agents: ["claude-code", "github-copilot-cli"],
  },
  {
    label: "Claude Code and CodeBuddy",
    agents: ["claude-code", "codebuddy"],
  },
] as const;

describe("axm lint (e2e, Phase 7)", () => {
  describe("workspace-authored canonical changes", () => {
    it("treats unpublished edits as non-blocking and recommends publish", async () => {
      const temp = createTempDir();
      try {
        const env = { HOME: temp.path, AXM_USER_HOME: temp.path };
        const setup = await runCli(
          ["setup", "--scope", "project", "--agent", "claude-code", "--yes", "--non-interactive"],
          {
            cwd: temp.path,
            env,
          },
        );
        expect(setup.exitCode).toBe(0);

        const scaffold = await runCli(
          ["skills", "new", "draft-skill", "--owner", "@test", "--yes"],
          { cwd: temp.path, env },
        );
        expect(scaffold.exitCode).toBe(0);

        const skillPath = path.join(
          temp.path,
          ".axm",
          "extensions",
          "@test",
          "skills",
          "draft-skill",
          "src",
          "SKILL.md",
        );
        fs.appendFileSync(skillPath, "\n## Author edit\n\nUnpublished working content.\n");

        const lint = await runCli(["lint", "--json"], { cwd: temp.path, env });
        expect(lint.exitCode, `${lint.stderr}\n${lint.stdout}`).toBe(0);
        expect(JSON.parse(lint.stdout).result.findings).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ ruleId: "workspace/authored-content-unpublished" }),
          ]),
        );
        const lintDocument = JSON.parse(lint.stdout);
        expect(lintDocument.ok).toBe(true);
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("Task 7.6 — stale artifacts + missing lockfile", () => {
    it("reports error findings for a declared-but-uninstalled skill", async () => {
      const temp = createTempDir();
      try {
        // Init creates settings + an empty lockfile (Phase 5 expectation).
        const init = await runCli(
          ["setup", "--scope", "project", "--agent", "claude-code", "--yes", "--non-interactive"],
          {
            cwd: temp.path,
          },
        );
        expect(init.exitCode).toBe(0);

        // Declare a skill whose source points at a non-existent local path
        // so `workspace/skills-lockfile-aligned` (missing-arm, error) and
        // `workspace/skills-artifacts-correct` (enabled-but-not-linked,
        // error) both fire.
        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        settings.skills = { demo: "@acme/skills/demo" };
        // Remove the lockfile to hit the `workspace/lockfile-valid`
        // missing-arm for the second fixture scenario below.
        writeJson(settingsPath, settings);

        const result = await runCli(["lint", "--json"], { cwd: temp.path });
        expect(result.exitCode).toBe(1);

        const doc = JSON.parse(result.stdout);
        expect(doc.ok).toBe(false);
        const findings = doc?.result?.findings ?? [];
        const ruleIds: Array<string> = findings.map((f: { ruleId: string }) => f.ruleId);
        expect(ruleIds).toContain("workspace/skills-lockfile-aligned");
        expect(ruleIds).toContain("workspace/skills-artifacts-correct");

        // Error severity pins: both findings above are `error` per the
        // platform-canonical config.
        const severities: Record<string, string> = Object.fromEntries(
          findings.map((f: { ruleId: string; severity: string }) => [f.ruleId, f.severity]),
        );
        expect(severities["workspace/skills-lockfile-aligned"]).toBe("error");
        expect(severities["workspace/skills-artifacts-correct"]).toBe("error");
      } finally {
        temp.cleanup();
      }
    });

    it("reports error when lockfile is deleted while skills remain declared", async () => {
      const temp = createTempDir();
      try {
        await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          { cwd: temp.path },
        );

        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        settings.skills = { demo: "@acme/skills/demo" };
        writeJson(settingsPath, settings);

        // Simulate a stale workspace where the lockfile was wiped.
        fs.rmSync(path.join(temp.path, ".axm", "axm-lock.yaml"), { force: true });

        const result = await runCli(["lint", "--json"], { cwd: temp.path });
        expect(result.exitCode).toBe(1);
        const doc = JSON.parse(result.stdout);
        expect(doc.ok).toBe(false);
        const findings = doc?.result?.findings ?? [];
        const ruleIds: Array<string> = findings.map((f: { ruleId: string }) => f.ruleId);
        expect(ruleIds).toContain("workspace/lockfile-valid");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("shared MCP target convergence", () => {
    it.each(sharedMcpPairs)(
      "converges the shared .mcp.json representation for $label",
      async ({ agents }) => {
        const temp = createTempDir("axm-shared-mcp-lint-");
        try {
          const env = { HOME: temp.path, AXM_USER_HOME: temp.path };
          const setup = await runCli(
            ["setup", "--scope", "project", "--agent", "claude-code", "--yes", "--non-interactive"],
            { cwd: temp.path, env },
          );
          expect(setup.exitCode, `${setup.stderr}\n${setup.stdout}`).toBe(0);

          const settingsPath = path.join(temp.path, ".axm", "settings.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          settings.agents = [...agents];
          settings.mcpServers = {
            demo: {
              enabled: true,
              command: "node",
              args: ["server.js"],
              env: {},
            },
          };
          writeJson(settingsPath, settings);

          const mcpPath = path.join(temp.path, ".mcp.json");
          writeJson(mcpPath, {
            mcpServers: {
              demo: {
                "x-axm": {
                  v: 1,
                  managed: true,
                  ext: "@workspace/mcps/demo",
                  source: "inline",
                },
                type: "local",
                enabled: false,
                command: "node",
                args: ["server.js"],
              },
            },
          });

          const before = await runCli(["lint", "--json"], { cwd: temp.path, env });
          const beforeFindings = JSON.parse(before.stdout)?.result?.findings ?? [];
          const beforeSharedFinding = beforeFindings.find(
            (finding: { ruleId: string }) =>
              finding.ruleId === "workspace/mcps-agent-drift" ||
              finding.ruleId === "workspace/mcps-shared-target-compatible",
          );
          expect(beforeSharedFinding).toBeDefined();
          expect(beforeSharedFinding.path).toBe("./.mcp.json");

          const firstFix = await runCli(["sync", "--json"], { cwd: temp.path, env });
          expect(firstFix.exitCode, `${firstFix.stderr}\n${firstFix.stdout}`).toBe(0);

          const firstConfigText = fs.readFileSync(mcpPath, "utf-8");
          const firstConfig = JSON.parse(firstConfigText);
          const demo = firstConfig.mcpServers.demo;
          expect(demo.type).toBe("stdio");
          expect(demo).not.toHaveProperty("enabled");
          expect(demo).not.toHaveProperty("disabled");

          const secondFix = await runCli(["sync", "--json"], { cwd: temp.path, env });
          expect(secondFix.exitCode, `${secondFix.stderr}\n${secondFix.stdout}`).toBe(0);
          expect(fs.readFileSync(mcpPath, "utf-8")).toBe(firstConfigText);

          const after = await runCli(["lint", "--json"], { cwd: temp.path, env });
          const afterFindings = JSON.parse(after.stdout)?.result?.findings ?? [];
          const sharedMcpFindings = afterFindings.filter(
            (finding: { ruleId: string }) =>
              finding.ruleId === "workspace/mcps-agent-drift" ||
              finding.ruleId === "workspace/mcps-shared-target-compatible",
          );
          expect(sharedMcpFindings).toEqual([]);
          expect(after.exitCode, `${after.stderr}\n${after.stdout}`).toBe(0);
        } finally {
          temp.cleanup();
        }
      },
    );
  });

  describe("Task 7.8 — --scope user", () => {
    it("runs against $AXM_USER_HOME and suppresses workspace/agents-detected-declared", async () => {
      const userHome = createTempDir("axm-phase7-user-home-");
      const emptyHome = createTempDir("axm-phase7-empty-home-");
      try {
        fs.mkdirSync(path.join(userHome.path, ".axm"), { recursive: true });
        writeJson(path.join(userHome.path, ".axm", "settings.json"), {
          agents: ["claude-code"],
          skills: { demo: "@acme/skills/demo" },
        });

        const result = await runCli(["lint", "--scope", "user", "--json"], {
          cwd: userHome.path,
          env: {
            AXM_USER_HOME: userHome.path,
            HOME: emptyHome.path,
          },
        });

        const findings = JSON.parse(result.stdout)?.result?.findings ?? [];
        const ruleIds = findings.map((f: { ruleId: string }) => f.ruleId);
        expect(result.exitCode).toBe(1);
        // `agents-detected-declared` fires only on project scope.
        expect(ruleIds).not.toContain("workspace/agents-detected-declared");
        // `lockfile-valid` fires because we declared a skill with no
        // lockfile present under $AXM_USER_HOME/.axm.
        expect(ruleIds).toContain("workspace/lockfile-valid");
      } finally {
        userHome.cleanup();
        emptyHome.cleanup();
      }
    });
  });

  describe("Git-index workspace view", () => {
    it("does not fail strict lint on generated gitignored instruction aliases", async () => {
      const temp = createTempDir("axm-staged-instructions-e2e-");
      try {
        initializeGit(temp.path);
        const env = {
          DO_NOT_TRACK: "1",
          AXM_REGISTRY_LOCATION: "http://127.0.0.1:9",
          AXM_REGISTRY_URL: "http://127.0.0.1:9",
        };
        const setup = await runCli(
          ["setup", "--scope", "project", "--agent", "claude-code", "--yes", "--non-interactive"],
          { cwd: temp.path, env },
        );
        expect(setup.exitCode, `${setup.stderr}\n${setup.stdout}`).toBe(0);
        expect(fs.lstatSync(path.join(temp.path, "CLAUDE.md")).isSymbolicLink()).toBe(true);
        expect(git(temp.path, ["check-ignore", "CLAUDE.md"]).trim()).toBe("CLAUDE.md");
        git(temp.path, ["add", "."]);

        const result = await runCli(["lint", "--view", "git-index", "--strict", "--json"], {
          cwd: temp.path,
          env,
        });

        expect(result.exitCode, `${result.stderr}\n${result.stdout}`).toBe(0);
        const findings: Array<{ ruleId: string }> = JSON.parse(result.stdout).result.findings;
        expect(findings.map((finding) => finding.ruleId)).not.toContain(
          "workspace/instructions-target-current",
        );
      } finally {
        temp.cleanup();
      }
    });

    it("fingerprints the complete exact index and leaves partial staging untouched", async () => {
      const temp = createTempDir("axm-staged-lint-e2e-");
      try {
        initializeGit(temp.path);
        const env = {
          DO_NOT_TRACK: "1",
          AXM_REGISTRY_LOCATION: "http://127.0.0.1:9",
          AXM_REGISTRY_URL: "http://127.0.0.1:9",
        };
        const setup = await runCli(
          ["setup", "--scope", "project", "--agent", "claude-code", "--yes", "--non-interactive"],
          { cwd: temp.path, env },
        );
        expect(setup.exitCode, `${setup.stderr}\n${setup.stdout}`).toBe(0);

        writeUnmanagedSkill(temp.path, "original");
        writeUnmanagedSkill(temp.path, "deleted");
        git(temp.path, ["add", "."]);
        git(temp.path, ["commit", "--quiet", "-m", "fixture"]);

        git(temp.path, ["mv", ".claude/skills/original", ".claude/skills/renamed"]);
        writeUnmanagedSkill(temp.path, "renamed", "Staged content");
        git(temp.path, ["add", ".claude/skills/renamed/SKILL.md"]);
        fs.writeFileSync(
          path.join(temp.path, ".claude", "skills", "renamed", "SKILL.md"),
          "unstaged invalid content\n",
        );
        fs.rmSync(path.join(temp.path, ".claude", "skills", "deleted"), {
          recursive: true,
        });
        git(temp.path, ["add", "--all", ".claude/skills/deleted"]);
        writeUnmanagedSkill(temp.path, "untracked", "Untracked content");

        const statusBefore = git(temp.path, ["status", "--porcelain=v2", "-z"]);
        const indexBefore = git(temp.path, ["ls-files", "--stage", "-z"]);
        const staged = await runCli(["lint", "--view", "git-index", "--json"], {
          cwd: path.join(temp.path, ".claude"),
          env,
        });

        expect(staged.exitCode, `${staged.stderr}\n${staged.stdout}`).toBe(0);
        const stagedDocument = JSON.parse(staged.stdout);
        expect(stagedDocument.ok).toBe(true);
        expect(stagedDocument.result.input).toMatchObject({ view: "git-index" });
        expect(stagedDocument.result.input.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(stagedDocument.result.input.fingerprint).not.toContain(temp.path);
        const strict = await runCli(["lint", "--view", "git-index", "--strict"], {
          cwd: temp.path,
          env,
        });
        expect(strict.exitCode).toBe(0);

        const details = await runCli(["lint", "--view", "git-index", "--details"], {
          cwd: temp.path,
          env,
        });
        expect(details.exitCode, `${details.stderr}\n${details.stdout}`).toBe(0);

        const nested = await runCli(
          ["lint", path.join(temp.path, ".claude"), "--view", "git-index", "--json"],
          { cwd: temp.path, env },
        );
        expect(nested.exitCode).toBe(10);
        expect(nested.stdout + nested.stderr).toContain(
          path.join(".claude", ".axm", "settings.json"),
        );

        const live = await runCli(["lint", "--json"], { cwd: temp.path, env });
        expect(live.exitCode).toBe(0);
        const liveDocument = JSON.parse(live.stdout);
        expect(liveDocument.result.input).toEqual({ view: "workspace" });

        const explicitLive = await runCli(["lint", "--view", "workspace", "--json"], {
          cwd: temp.path,
          env,
        });
        expect(explicitLive.exitCode).toBe(live.exitCode);
        expect(JSON.parse(explicitLive.stdout)).toEqual(liveDocument);

        expect(git(temp.path, ["status", "--porcelain=v2", "-z"])).toBe(statusBefore);
        expect(git(temp.path, ["ls-files", "--stage", "-z"])).toBe(indexBefore);
        expect(
          fs.readFileSync(path.join(temp.path, ".claude", "skills", "renamed", "SKILL.md"), "utf8"),
        ).toBe("unstaged invalid content\n");
      } finally {
        temp.cleanup();
      }
    });

    it("uses staged bytes instead of a valid unstaged settings file", async () => {
      const temp = createTempDir("axm-staged-settings-e2e-");
      try {
        initializeGit(temp.path);
        const setup = await runCli(
          ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
          {
            cwd: temp.path,
            env: { DO_NOT_TRACK: "1" },
          },
        );
        expect(setup.exitCode, `${setup.stderr}\n${setup.stdout}`).toBe(0);
        git(temp.path, ["add", "."]);
        git(temp.path, ["commit", "--quiet", "-m", "fixture"]);

        const settingsPath = path.join(temp.path, ".axm", "settings.json");
        const validSettings = fs.readFileSync(settingsPath, "utf8");
        const stagedSettings = JSON.parse(validSettings);
        stagedSettings.skills = {
          ...stagedSettings.skills,
          demo: "@acme/skills/demo",
        };
        writeJson(settingsPath, stagedSettings);
        git(temp.path, ["add", ".axm/settings.json"]);
        fs.writeFileSync(settingsPath, validSettings);

        const statusBefore = git(temp.path, ["status", "--porcelain=v2", "-z"]);
        const indexBefore = git(temp.path, ["ls-files", "--stage", "-z"]);
        const result = await runCli(["lint", "--view", "git-index", "--json"], {
          cwd: temp.path,
          env: { DO_NOT_TRACK: "1" },
        });

        expect(result.exitCode).toBe(1);
        const findings: Array<{ ruleId: string }> = JSON.parse(result.stdout).result.findings;
        expect(findings.map((finding) => finding.ruleId)).toContain(
          "workspace/configured-but-not-installed",
        );
        expect(git(temp.path, ["status", "--porcelain=v2", "-z"])).toBe(statusBefore);
        expect(git(temp.path, ["ls-files", "--stage", "-z"])).toBe(indexBefore);
        expect(fs.readFileSync(settingsPath, "utf8")).toBe(validSettings);
      } finally {
        temp.cleanup();
      }
    });

    it("rejects user scope and non-Git workspaces", async () => {
      const temp = createTempDir("axm-staged-errors-e2e-");
      try {
        const user = await runCli(["lint", "--view", "git-index", "--scope", "user"], {
          cwd: temp.path,
        });
        expect(user.exitCode).toBe(9);
        expect(user.stdout + user.stderr).toContain(
          "--view git-index cannot be combined with --scope user",
        );

        const outsideGit = await runCli(["lint", "--view", "git-index"], { cwd: temp.path });
        expect(outsideGit.exitCode).toBe(9);
        expect(outsideGit.stdout + outsideGit.stderr).toContain("requires a Git repository");
      } finally {
        temp.cleanup();
      }
    });

    it("rejects the removed --staged flag", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["lint", "--staged"], { cwd: temp.path });
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout + result.stderr).toContain("Unrecognized flag: --staged");
      } finally {
        temp.cleanup();
      }
    });
  });

  describe("Task 7.10 — doctor and sync unknown-command contract", () => {
    it("axm doctor returns non-zero with 'Unknown subcommand'", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["doctor"], { cwd: temp.path });
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout + result.stderr).toContain("Unknown subcommand");
      } finally {
        temp.cleanup();
      }
    });

    it("axm mcps doctor and reconcile return non-zero with 'Unknown subcommand'", async () => {
      const temp = createTempDir();
      try {
        const doctor = await runCli(["mcps", "doctor"], { cwd: temp.path });
        const reconcile = await runCli(["mcps", "reconcile"], { cwd: temp.path });
        expect(doctor.exitCode).not.toBe(0);
        expect(doctor.stdout + doctor.stderr).toContain("Unknown subcommand");
        expect(reconcile.exitCode).not.toBe(0);
        expect(reconcile.stdout + reconcile.stderr).toContain("Unknown subcommand");
      } finally {
        temp.cleanup();
      }
    });

    it("axm sync requires an initialized workspace", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["sync"], { cwd: temp.path });
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout + result.stderr).toContain("Workspace settings not found");
      } finally {
        temp.cleanup();
      }
    });
  });
});
