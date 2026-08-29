/**
 * Executable Cases for:
 * - AXM-EVAL-REQ-PROJECT-WORKSPACE-SETTINGS-VALIDITY
 * - AXM-EVAL-ARCH-PROJECT-WORKSPACE-CONSTRUCTION-GATE
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "./e2e/utils.js";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const snapshotTree = (root: string): Readonly<Record<string, string>> => {
  const snapshot: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      if (entry.isDirectory()) {
        snapshot[relative] = "directory";
        visit(absolute);
      } else if (entry.isSymbolicLink()) {
        snapshot[relative] = `symlink:${fs.readlinkSync(absolute)}`;
      } else {
        snapshot[relative] = `file:${fs.readFileSync(absolute).toString("base64")}`;
      }
    }
  };
  visit(root);
  return snapshot;
};

const expectMachineError = (
  stdout: string,
  stderr: string,
  settingsPath: string,
  fault: string,
  correction: string,
): void => {
  const document: unknown = JSON.parse(stdout);
  expect(isRecord(document)).toBe(true);
  if (!isRecord(document)) return;
  expect(document["ok"]).toBe(false);
  expect(document["code"]).toBe("validation");
  const serialized = JSON.stringify(document);
  expect(serialized).toContain(settingsPath);
  expect(serialized).toContain(fault);
  expect(serialized).toContain(correction);
  for (const line of stderr.split("\n").filter((candidate) => candidate.trim().length > 0)) {
    expect(() => JSON.parse(line)).not.toThrow();
  }
};

describe("project workspace settings validity prerequisite", () => {
  it("gates representative command families, preserves state, and recovers after correction", async () => {
    const workspace = createTempDir("axm-settings-gate-workspace-");
    const userHome = createTempDir("axm-settings-gate-home-");
    const env = { HOME: userHome.path, AXM_USER_HOME: userHome.path };
    const projectSettingsPath = path.join(workspace.path, "axm.json");
    const userSettingsPath = path.join(userHome.path, ".axm", "workspace", "axm.json");

    try {
      const projectSetup = await runCli(
        ["setup", "--scope", "project", "--agent", "claude-code", "--yes", "--non-interactive"],
        { cwd: workspace.path, env },
      );
      expect(projectSetup.exitCode, projectSetup.stdout + projectSetup.stderr).toBe(0);
      const userSetup = await runCli(
        ["setup", "--scope", "user", "--agent", "claude-code", "--yes", "--non-interactive"],
        { cwd: workspace.path, env },
      );
      expect(userSetup.exitCode, userSetup.stdout + userSetup.stderr).toBe(0);

      const validProjectSettings = fs.readFileSync(projectSettingsPath, "utf8");
      const validUserSettings = fs.readFileSync(userSettingsPath, "utf8");
      const cases = [
        {
          name: "project read command in human mode",
          settingsPath: projectSettingsPath,
          invalid: "{ not-json",
          args: ["skills", "list"],
          machine: false,
          fault: "not valid JSON",
          correction: "Fix the JSON syntax",
        },
        {
          name: "user diagnostic command in machine mode",
          settingsPath: userSettingsPath,
          invalid: JSON.stringify({ agents: "claude-code" }),
          args: ["lint", "--json"],
          machine: true,
          fault: "Invalid workspace settings",
          correction: "Edit the settings file",
        },
        {
          name: "project reconciliation preview in machine mode",
          settingsPath: projectSettingsPath,
          invalid: "directory",
          args: ["sync", "--preview", "--non-interactive", "--json"],
          machine: true,
          fault: "could not be read",
          correction: "Repair the settings file permissions",
        },
        {
          name: "user settings mutation in machine mode",
          settingsPath: userSettingsPath,
          invalid: "{ not-json",
          args: ["agents", "add", "opencode", "--yes", "--non-interactive", "--json"],
          machine: true,
          fault: "not valid JSON",
          correction: "Fix the JSON syntax",
        },
        {
          name: "accept-warnings mutation cannot bypass the gate",
          settingsPath: projectSettingsPath,
          invalid: JSON.stringify({ agents: "claude-code" }),
          args: [
            "agents",
            "add",
            "opencode",
            "--yes",
            "--accept-warnings",
            "--non-interactive",
            "--json",
          ],
          machine: true,
          fault: "Invalid workspace settings",
          correction: "Edit the settings file",
        },
        {
          name: "reinstall-capable lifecycle command cannot bypass the gate",
          settingsPath: userSettingsPath,
          invalid: "{ not-json",
          args: [
            "skills",
            "install",
            SKILLS_REPO_FIXTURE,
            "--skill",
            "my-skill",
            "--yes",
            "--reinstall",
            "--non-interactive",
            "--json",
          ],
          machine: true,
          fault: "not valid JSON",
          correction: "Fix the JSON syntax",
        },
      ] as const;

      for (const testCase of cases) {
        fs.rmSync(testCase.settingsPath, { recursive: true, force: true });
        if (testCase.invalid === "directory") {
          fs.mkdirSync(testCase.settingsPath, { recursive: true });
        } else {
          fs.mkdirSync(path.dirname(testCase.settingsPath), { recursive: true });
          fs.writeFileSync(testCase.settingsPath, testCase.invalid);
        }
        const before = {
          project: snapshotTree(workspace.path),
          user: snapshotTree(userHome.path),
        };

        const result = await runCli(testCase.args, { cwd: workspace.path, env });

        expect(result.exitCode, `${testCase.name}\n${result.stdout}${result.stderr}`).not.toBe(0);
        expect({
          project: snapshotTree(workspace.path),
          user: snapshotTree(userHome.path),
        }).toEqual(before);
        if (testCase.machine) {
          expectMachineError(
            result.stdout,
            result.stderr,
            testCase.settingsPath,
            testCase.fault,
            testCase.correction,
          );
        } else {
          const output = result.stdout + result.stderr;
          expect(output).toContain(testCase.settingsPath);
          expect(output).toContain(testCase.fault);
          expect(output).toContain(testCase.correction);
        }

        fs.rmSync(testCase.settingsPath, { recursive: true, force: true });
        fs.mkdirSync(path.dirname(testCase.settingsPath), { recursive: true });
        fs.writeFileSync(
          testCase.settingsPath,
          testCase.settingsPath === projectSettingsPath ? validProjectSettings : validUserSettings,
        );
        const recovered = await runCli(testCase.args, { cwd: workspace.path, env });
        expect(
          recovered.exitCode,
          `${testCase.name} after direct correction\n${recovered.stdout}${recovered.stderr}`,
        ).toBe(0);
      }

      fs.rmSync(userSettingsPath, { force: true });
      const missingUser = await runCli(["skills", "list", "--json"], {
        cwd: workspace.path,
        env,
      });
      expect(missingUser.exitCode, missingUser.stdout + missingUser.stderr).toBe(0);
      expect(fs.existsSync(userSettingsPath)).toBe(false);

      fs.writeFileSync(userSettingsPath, validUserSettings);
      fs.rmSync(projectSettingsPath, { force: true });
      const missingProject = await runCli(["skills", "list", "--json"], {
        cwd: workspace.path,
        env,
      });
      expect(missingProject.exitCode, missingProject.stdout + missingProject.stderr).toBe(0);
      expect(fs.existsSync(projectSettingsPath)).toBe(false);
    } finally {
      workspace.cleanup();
      userHome.cleanup();
    }
  });

  it("keeps version and help outside the workspace settings gate", async () => {
    const workspace = createTempDir("axm-settings-gate-controls-");
    const userHome = createTempDir("axm-settings-gate-controls-home-");
    const env = { HOME: userHome.path, AXM_USER_HOME: userHome.path };
    try {
      fs.writeFileSync(path.join(workspace.path, "axm.json"), "{ not-json");
      fs.mkdirSync(path.join(userHome.path, ".axm", "workspace"), { recursive: true });
      fs.writeFileSync(path.join(userHome.path, ".axm", "workspace", "axm.json"), "{ not-json");

      const version = await runCli(["--version"], { cwd: workspace.path, env });
      expect(version.exitCode, version.stdout + version.stderr).toBe(0);
      const help = await runCli(["help", "settings"], { cwd: workspace.path, env });
      expect(help.exitCode, help.stdout + help.stderr).toBe(0);
    } finally {
      workspace.cleanup();
      userHome.cleanup();
    }
  });
});
