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
  it("applies an eligible explicit mutation non-interactively without --yes", async () => {
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
      const applied = await runCli(["skills", "disable", "recovery-skill", "--non-interactive"], {
        cwd: workspace.path,
      });
      expect(applied.exitCode, applied.stdout + applied.stderr).toBe(0);
      expect(snapshotWorkspace(workspace.path)).not.toEqual(before);
    } finally {
      workspace.cleanup();
    }
  });

  it("returns a runnable named-policy retry without letting --yes substitute", async () => {
    const workspace = createTempDir();
    try {
      const setup = await runCli(["setup", "--yes", "--non-interactive"], {
        cwd: workspace.path,
      });
      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
      const skill = await runCli(
        ["skills", "new", "pack-member", "--owner", "@test", "--non-interactive"],
        { cwd: workspace.path },
      );
      expect(skill.exitCode, skill.stdout + skill.stderr).toBe(0);
      const pack = await runCli(
        ["packs", "new", "recovery-pack", "--owner", "@test", "--non-interactive"],
        { cwd: workspace.path },
      );
      expect(pack.exitCode, pack.stdout + pack.stderr).toBe(0);
      const added = await runCli(
        ["packs", "add", "recovery-pack", "@test/skills/pack-member", "--non-interactive"],
        { cwd: workspace.path },
      );
      expect(added.exitCode, added.stdout + added.stderr).toBe(0);
      const before = snapshotWorkspace(workspace.path);

      const blocked = await runCli(
        [
          "packs",
          "remove",
          "recovery-pack",
          "@test/skills/pack-member",
          "--yes",
          "--non-interactive",
          "--json",
        ],
        { cwd: workspace.path },
      );
      const blockedOutput = `${blocked.stdout}\n${blocked.stderr}`;
      expect(blocked.exitCode).toBe(2);
      expect(blockedOutput).toContain('"reason": "override-required"');
      expect(blockedOutput).toContain(
        "axm packs remove --json --non-interactive --allow-empty recovery-pack @test/skills/pack-member",
      );
      expect(snapshotWorkspace(workspace.path)).toEqual(before);

      const retried = await runCli(
        [
          "packs",
          "remove",
          "recovery-pack",
          "@test/skills/pack-member",
          "--allow-empty",
          "--non-interactive",
        ],
        { cwd: workspace.path },
      );
      expect(retried.exitCode, retried.stdout + retried.stderr).toBe(0);
      expect(snapshotWorkspace(workspace.path)).not.toEqual(before);
    } finally {
      workspace.cleanup();
    }
  });
});
