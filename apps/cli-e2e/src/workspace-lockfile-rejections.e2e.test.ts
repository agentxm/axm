import { snapshotHomeWithoutFailureRecords } from "./test-support/diagnostic-home-snapshot.js";
/** Process-boundary evidence for workspace lockfile rejection contracts. */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "./e2e/utils.js";
import { LEGACY_LOCKFILE_NAME, LOCKFILE_NAME } from "./test-support/lockfile.js";

export const executionBinding = {
  requirements: [
    "cli/invalid-workspace-state-gates-operations",
    "cli/machine-errors-use-the-stable-envelope",
    "workspace/lockfile/preserves-tool-values",
  ],
  boundary: "process",
  rationale:
    "Proves the shipped command wiring emits exit 9 and one structured error document, refuses a newer axm.lock with upgrade guidance and a legacy axm-lock.yaml with re-acceptance recovery, preserves project and user bytes, keeps global upgrade guidance unscoped, honors the forward-version precedence over uninitialized state, uses the shared schema diagnosis for a Knowledge command, and preserves typed tool values through install and withdrawal while rejecting unrepresentable values without overwriting prior bytes.",
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
  it("preserves typed tool values through install and withdrawal in the shipped runtime", async () => {
    const workspace = createTempDir("axm-tool-preservation-workspace-");
    const userHome = createTempDir("axm-tool-preservation-home-");
    const source = createTempDir("axm-tool-preservation-source-");
    const env = { HOME: userHome.path, AXM_USER_HOME: userHome.path };
    const values = [
      "integer = 2",
      "float = 2.0",
      "zero = -0.0",
      "large = 9223372036854775807",
      "minimum = -9223372036854775808",
      "fraction = 0.1",
      "nothing = nan",
      "positive = inf",
      "negative = -inf",
      "offset = 2026-10-15T06:30:00.123456789123456789+02:30",
      "local = 2026-10-15T06:30:00.123456",
      "date = 2026-10-15",
      "time = 06:30:00.123456789",
      "leap = 2016-12-31T23:59:60Z",
      'text = "2026-10-15"',
      "flag = true",
      'mixed = [2, 2.0, -0.0, "two", true, []]',
      'tag = { _tag = "integer", value = "0" }',
      "empty = {}",
      "__proto__ = 7",
    ];
    try {
      await setupScope("project", workspace.path, env);
      fs.writeFileSync(
        path.join(source.path, "skill.json"),
        JSON.stringify({
          owner: "@acme",
          type: "skill",
          name: "review",
          version: "1.0.0",
          description: "Tool preservation fixture",
        }),
      );
      fs.mkdirSync(path.join(source.path, "src"));
      fs.writeFileSync(
        path.join(source.path, "src", "SKILL.md"),
        "---\nname: review\ndescription: Review changes.\n---\n\nReview the change.\n",
      );
      const lockPath = path.join(workspace.path, LOCKFILE_NAME);
      fs.writeFileSync(lockPath, `version = 1\n[tool.audit]\n${values.join("\n")}\n`);
      for (const args of [
        ["install", source.path, "--skill", "review"],
        ["skills", "uninstall", "review"],
      ]) {
        const result = await runCli([...args, "--non-interactive", "--json"], {
          cwd: workspace.path,
          env,
        });
        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        const written = fs.readFileSync(lockPath, "utf8");
        for (const value of values) expect(written).toContain(`${value}\n`);
      }
    } finally {
      workspace.cleanup();
      userHome.cleanup();
      source.cleanup();
    }
  });

  it.each([
    "9223372036854775808",
    "-9223372036854775809",
    "1e999",
    "1e-999",
    "2026-02-30",
    "24:00:00",
  ])(
    "reports an unrepresentable tool value %s without corrupting machine output or prior bytes",
    async (value) => {
      const workspace = createTempDir("axm-tool-value-workspace-");
      const userHome = createTempDir("axm-tool-value-home-");
      const env = { HOME: userHome.path, AXM_USER_HOME: userHome.path };
      try {
        await setupScope("project", workspace.path, env);
        const lockPath = path.join(workspace.path, LOCKFILE_NAME);
        const raw = `version = 1\n[tool.audit]\nlarge = 9223372036854775807\nvalue = ${value}\n`;
        fs.writeFileSync(lockPath, raw);
        const result = await runCli(["sync", "--json"], { cwd: workspace.path, env });
        expect(result.exitCode, result.stdout + result.stderr).toBe(9);
        expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: "validation" });
        expect(result.stdout).toContain("axm.lock");
        expectMachineStream(result.stderr);
        expect(fs.readFileSync(lockPath, "utf8")).toBe(raw);
      } finally {
        workspace.cleanup();
        userHome.cleanup();
      }
    },
  );

  it("reports a newer project lockfile with an upgrade and no mutation", async () => {
    const workspace = createTempDir("axm-new-project-lock-workspace-");
    const userHome = createTempDir("axm-new-project-lock-home-");
    const env = { HOME: userHome.path, AXM_USER_HOME: userHome.path };
    try {
      await setupScope("project", workspace.path, env);
      const lockPath = path.join(workspace.path, LOCKFILE_NAME);
      fs.writeFileSync(lockPath, "version = 9\n");
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
          path: fs.realpathSync(lockPath),
          observedVersion: 9,
          supportedVersion: 1,
          direction: "newer",
        },
        suggestions: [{ cmd: "axm upgrade" }],
      });
      expect(JSON.stringify(document)).not.toMatch(/permission|restore|remove|setup/i);
      expect(snapshotTree(workspace.path)).toEqual(before);
      expectMachineStream(result.stderr);
    } finally {
      workspace.cleanup();
      userHome.cleanup();
    }
  });

  it("reports a legacy project lockfile with re-acceptance recovery and no mutation", async () => {
    const workspace = createTempDir("axm-old-lock-workspace-");
    const userHome = createTempDir("axm-old-lock-home-");
    const env = { HOME: userHome.path, AXM_USER_HOME: userHome.path };
    try {
      await setupScope("project", workspace.path, env);
      const lockPath = path.join(workspace.path, LEGACY_LOCKFILE_NAME);
      fs.writeFileSync(lockPath, "lockfileVersion: 12\npackages: {}\nskills: {}\n");
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
          path: fs.realpathSync(lockPath),
          observedVersion: 12,
          supportedVersion: 1,
          direction: "older",
        },
        suggestions: [
          {
            description:
              "Back up the incompatible lockfile outside the workspace, review axm.json, then remove the incompatible file.",
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
      const lockPath = path.join(userHome.path, ".axm", "workspace", LOCKFILE_NAME);
      fs.writeFileSync(lockPath, "version = 13\n");
      const before = snapshotHomeWithoutFailureRecords(userHome.path);

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
            observedVersion: 13,
            supportedVersion: 1,
            direction: "newer",
          },
          suggestions: [{ cmd: "axm upgrade" }],
        });
        expect(JSON.stringify(document)).not.toMatch(/--scope user|setup|restore|remove/i);
        expectMachineStream(result.stderr);
      }
      expect(snapshotHomeWithoutFailureRecords(userHome.path)).toEqual(before);
    } finally {
      workspace.cleanup();
      userHome.cleanup();
    }
  });

  it("adds user scope only to workspace recovery commands for a legacy user lockfile", async () => {
    const workspace = createTempDir("axm-old-user-lock-workspace-");
    const userHome = createTempDir("axm-old-user-lock-home-");
    const env = { HOME: userHome.path, AXM_USER_HOME: userHome.path };
    try {
      await setupScope("user", workspace.path, env);
      const lockPath = path.join(userHome.path, ".axm", "workspace", LEGACY_LOCKFILE_NAME);
      fs.writeFileSync(lockPath, "lockfileVersion: 12\npackages: {}\nskills: {}\n");
      const before = snapshotHomeWithoutFailureRecords(userHome.path);

      const result = await runCli(["list", "--scope", "user", "--json"], {
        cwd: workspace.path,
        env,
      });

      expect(result.exitCode, result.stdout + result.stderr).toBe(9);
      const document = JSON.parse(result.stdout);
      expect(document.problem).toMatchObject({
        code: "workspace-lockfile-version-unsupported",
        path: lockPath,
        observedVersion: 12,
        supportedVersion: 1,
        direction: "older",
      });
      expect(
        document.suggestions.flatMap((suggestion: { cmd?: string }) =>
          suggestion.cmd === undefined ? [] : [suggestion.cmd],
        ),
      ).toEqual(["axm sync --preview --scope user", "axm sync --scope user"]);
      expect(snapshotHomeWithoutFailureRecords(userHome.path)).toEqual(before);
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
      const lockPath = path.join(workspace.path, LOCKFILE_NAME);
      fs.rmSync(settingsPath);
      fs.writeFileSync(lockPath, "version = 13\n");
      const before = snapshotTree(workspace.path);

      const result = await runCli(["list", "--json"], { cwd: workspace.path, env });

      expect(result.exitCode, result.stdout + result.stderr).toBe(9);
      const document = JSON.parse(result.stdout);
      expect(document).toMatchObject({
        problem: { path: fs.realpathSync(lockPath), direction: "newer" },
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
      const lockPath = path.join(workspace.path, LOCKFILE_NAME);
      fs.writeFileSync(lockPath, 'version = "six"\n');
      const before = snapshotTree(workspace.path);

      const result = await runCli(["knowledge", "concepts", "query", "architecture", "--json"], {
        cwd: workspace.path,
        env,
      });

      expect(result.exitCode, result.stdout + result.stderr).toBe(9);
      const document = JSON.parse(result.stdout);
      expect(document).toMatchObject({ ok: false, code: "validation" });
      expect(document.detail).toContain(
        `Invalid workspace lockfile at ${fs.realpathSync(lockPath)}`,
      );
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
