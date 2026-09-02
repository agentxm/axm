/** Process-boundary evidence for workspace lockfile rejection contracts. */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "./e2e/utils.js";

export const executionBinding = {
  requirements: [
    "cli/workspace-lockfile-rejections-name-state-and-recovery",
    "cli/lockfile-version-errors-expose-structured-problem",
  ],
  boundary: "process",
  rationale:
    "Proves the shipped command wiring emits exit 9 and one structured error document, preserves project and user bytes, keeps global upgrade guidance unscoped, honors the forward-version precedence over uninitialized state, and uses the shared schema diagnosis for a Knowledge command.",
} as const;

const snapshotTree = (root: string): Readonly<Record<string, string>> => {
  const snapshot: Record<string, string> = {};
  if (!fs.existsSync(root)) return snapshot;
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

const expectMachineStream = (stderr: string): void => {
  for (const line of stderr.split("\n").filter((candidate) => candidate.trim().length > 0)) {
    expect(() => JSON.parse(line)).not.toThrow();
  }
};

const setupScope = async (
  scope: "project" | "user",
  cwd: string,
  env: Readonly<Record<string, string>>,
) => {
  const result = await runCli(
    ["setup", "--scope", scope, "--agent", "claude-code", "--yes", "--non-interactive"],
    { cwd, env },
  );
  expect(result.exitCode, result.stdout + result.stderr).toBe(0);
};

describe("workspace lockfile rejection diagnostics", () => {
  it("reports an older project lockfile with re-acceptance recovery and no mutation", async () => {
    const workspace = createTempDir("axm-old-lock-workspace-");
    const userHome = createTempDir("axm-old-lock-home-");
    const env = { HOME: userHome.path, AXM_USER_HOME: userHome.path };
    try {
      await setupScope("project", workspace.path, env);
      const lockPath = path.join(workspace.path, "axm-lock.yaml");
      fs.writeFileSync(lockPath, "lockfileVersion: 5\nskills: {}\n");
      const before = snapshotTree(workspace.path);

      const result = await runCli(["list", "--json"], { cwd: workspace.path, env });

      expect(result.exitCode, result.stdout + result.stderr).toBe(9);
      const document = JSON.parse(result.stdout);
      expect(document).toMatchObject({
        ok: false,
        code: "validation",
        title: "Unsupported workspace lockfile version",
        problem: {
          code: "workspace-lockfile-version-unsupported",
          path: lockPath,
          observedVersion: 5,
          supportedVersion: 6,
          direction: "older",
        },
        suggestions: [
          {
            description:
              "Preserve the incompatible lockfile outside its authoritative path, review the desired workspace intent, then remove the incompatible file.",
          },
          { cmd: "axm sync --preview" },
          { cmd: "axm sync" },
          {
            description:
              "A workspace containing only workspace-authored content may correctly finish without a lockfile.",
          },
        ],
      });
      expect(JSON.stringify(document)).not.toMatch(/permission|restore from version control/i);
      expect(snapshotTree(workspace.path)).toEqual(before);
      expectMachineStream(result.stderr);
    } finally {
      workspace.cleanup();
      userHome.cleanup();
    }
  });

  it("reports a newer user lockfile through read and lint with an unscoped upgrade", async () => {
    const workspace = createTempDir("axm-new-lock-workspace-");
    const userHome = createTempDir("axm-new-lock-home-");
    const env = { HOME: userHome.path, AXM_USER_HOME: userHome.path };
    try {
      await setupScope("user", workspace.path, env);
      const lockPath = path.join(userHome.path, ".axm", "workspace", "axm-lock.yaml");
      fs.writeFileSync(lockPath, "lockfileVersion: 7\nskills: {}\n");
      const before = snapshotTree(userHome.path);

      for (const args of [
        ["list", "--scope", "user", "--json"],
        ["lint", "--scope", "user", "--json"],
      ]) {
        const result = await runCli(args, { cwd: workspace.path, env });
        expect(result.exitCode, result.stdout + result.stderr).toBe(9);
        const document = JSON.parse(result.stdout);
        expect(document).toMatchObject({
          ok: false,
          code: "validation",
          problem: {
            path: lockPath,
            observedVersion: 7,
            supportedVersion: 6,
            direction: "newer",
          },
          suggestions: [{ cmd: "axm upgrade" }],
        });
        expect(JSON.stringify(document)).not.toMatch(/--scope user|setup|restore|remove/i);
        expectMachineStream(result.stderr);
      }
      expect(snapshotTree(userHome.path)).toEqual(before);
    } finally {
      workspace.cleanup();
      userHome.cleanup();
    }
  });

  it("adds user scope only to workspace recovery commands for an older user lockfile", async () => {
    const workspace = createTempDir("axm-old-user-lock-workspace-");
    const userHome = createTempDir("axm-old-user-lock-home-");
    const env = { HOME: userHome.path, AXM_USER_HOME: userHome.path };
    try {
      await setupScope("user", workspace.path, env);
      const lockPath = path.join(userHome.path, ".axm", "workspace", "axm-lock.yaml");
      fs.writeFileSync(lockPath, "lockfileVersion: 5\nskills: {}\n");
      const before = snapshotTree(userHome.path);

      const result = await runCli(["list", "--scope", "user", "--json"], {
        cwd: workspace.path,
        env,
      });

      expect(result.exitCode, result.stdout + result.stderr).toBe(9);
      const document = JSON.parse(result.stdout);
      expect(document.problem).toMatchObject({ path: lockPath, direction: "older" });
      expect(
        document.suggestions.flatMap((suggestion: { cmd?: string }) =>
          suggestion.cmd === undefined ? [] : [suggestion.cmd],
        ),
      ).toEqual(["axm sync --preview --scope user", "axm sync --scope user"]);
      expect(snapshotTree(userHome.path)).toEqual(before);
      expectMachineStream(result.stderr);
    } finally {
      workspace.cleanup();
      userHome.cleanup();
    }
  });

  it("prefers a newer lockfile diagnosis when project settings are absent", async () => {
    const workspace = createTempDir("axm-new-lock-no-settings-workspace-");
    const userHome = createTempDir("axm-new-lock-no-settings-home-");
    const env = { HOME: userHome.path, AXM_USER_HOME: userHome.path };
    try {
      await setupScope("project", workspace.path, env);
      const settingsPath = path.join(workspace.path, "axm.json");
      const lockPath = path.join(workspace.path, "axm-lock.yaml");
      fs.rmSync(settingsPath);
      fs.writeFileSync(lockPath, "lockfileVersion: 7\nskills: {}\n");
      const before = snapshotTree(workspace.path);

      const result = await runCli(["list", "--json"], { cwd: workspace.path, env });

      expect(result.exitCode, result.stdout + result.stderr).toBe(9);
      const document = JSON.parse(result.stdout);
      expect(document).toMatchObject({
        problem: { path: lockPath, direction: "newer" },
        suggestions: [{ cmd: "axm upgrade" }],
      });
      expect(JSON.stringify(document)).not.toMatch(/not initialized|axm setup/i);
      expect(snapshotTree(workspace.path)).toEqual(before);
      expectMachineStream(result.stderr);
    } finally {
      workspace.cleanup();
      userHome.cleanup();
    }
  });

  it("uses the shared schema diagnosis for a Knowledge workspace command", async () => {
    const workspace = createTempDir("axm-invalid-lock-knowledge-workspace-");
    const userHome = createTempDir("axm-invalid-lock-knowledge-home-");
    const env = { HOME: userHome.path, AXM_USER_HOME: userHome.path };
    try {
      await setupScope("project", workspace.path, env);
      const lockPath = path.join(workspace.path, "axm-lock.yaml");
      fs.writeFileSync(lockPath, 'lockfileVersion: "six"\nskills: {}\n');
      const before = snapshotTree(workspace.path);

      const result = await runCli(["knowledge", "concepts", "search", "architecture", "--json"], {
        cwd: workspace.path,
        env,
      });

      expect(result.exitCode, result.stdout + result.stderr).toBe(9);
      const document = JSON.parse(result.stdout);
      expect(document).toMatchObject({ ok: false, code: "validation" });
      expect(document.detail).toContain(`Invalid workspace lockfile at ${lockPath}`);
      expect(document.detail).not.toMatch(/permission/i);
      expect(document.problem).toBeUndefined();
      expect(snapshotTree(workspace.path)).toEqual(before);
      expectMachineStream(result.stderr);
    } finally {
      workspace.cleanup();
      userHome.cleanup();
    }
  });
});
