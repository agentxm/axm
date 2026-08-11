import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "./e2e/utils.js";

const snapshotWorkspace = (workspace: string): Readonly<Record<string, string>> => {
  const snapshot: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(workspace, absolute);
      if (entry.isDirectory()) {
        snapshot[relative] = "directory";
        visit(absolute);
      } else if (entry.isSymbolicLink()) {
        snapshot[relative] = `symlink:${fs.readlinkSync(absolute)}`;
      } else {
        snapshot[relative] = fs.readFileSync(absolute).toString("base64");
      }
    }
  };
  visit(workspace);
  return snapshot;
};

describe("confirmation recovery", () => {
  it("returns a runnable typed retry and leaves state unchanged before retry", async () => {
    const workspace = createTempDir();
    try {
      const setup = await runCli(
        ["setup", "--agent", "claude-code", "--yes", "--non-interactive"],
        { cwd: workspace.path },
      );
      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
      const created = await runCli(
        ["skills", "new", "recovery-skill", "--owner", "@test", "--yes", "--non-interactive"],
        { cwd: workspace.path },
      );
      expect(created.exitCode, created.stdout + created.stderr).toBe(0);

      const before = snapshotWorkspace(workspace.path);
      const blocked = await runCli(["skills", "disable", "recovery-skill", "--non-interactive"], {
        cwd: workspace.path,
      });
      const blockedOutput = `${blocked.stdout}\n${blocked.stderr}`;
      expect(blocked.exitCode).not.toBe(0);
      expect(blockedOutput).toContain("axm skills disable --non-interactive --yes recovery-skill");
      expect(snapshotWorkspace(workspace.path)).toEqual(before);

      const retried = await runCli(
        ["skills", "disable", "--non-interactive", "--yes", "recovery-skill"],
        { cwd: workspace.path },
      );
      expect(retried.exitCode, retried.stdout + retried.stderr).toBe(0);
      expect(snapshotWorkspace(workspace.path)).not.toEqual(before);
    } finally {
      workspace.cleanup();
    }
  });

  it("does not disclose a protected free-form value in recovery guidance", async () => {
    const workspace = createTempDir();
    const protectedDescription = "sensitive recovery description";
    try {
      const setup = await runCli(["setup", "--yes", "--non-interactive"], {
        cwd: workspace.path,
      });
      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
      const before = snapshotWorkspace(workspace.path);

      const blocked = await runCli(
        [
          "mcps",
          "new",
          "protected-recovery",
          "--owner",
          "@test",
          "--description",
          protectedDescription,
          "--non-interactive",
        ],
        { cwd: workspace.path },
      );
      const blockedOutput = `${blocked.stdout}\n${blocked.stderr}`;
      expect(blocked.exitCode).not.toBe(0);
      expect(blockedOutput).toContain("Rerun the original invocation with --yes");
      expect(blockedOutput).not.toContain(protectedDescription);
      expect(blockedOutput).not.toContain("axm mcps new");
      expect(snapshotWorkspace(workspace.path)).toEqual(before);
    } finally {
      workspace.cleanup();
    }
  });
});
