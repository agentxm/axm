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
        ["setup", "--scope", "project", "--agent", "claude-code", "--yes", "--non-interactive"],
        { cwd: workspace.path },
      );
      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
      const settingsPath = path.join(workspace.path, "axm.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      fs.writeFileSync(
        settingsPath,
        `${JSON.stringify({ ...settings, owner: "@test" }, null, 2)}\n`,
      );
      const created = await runCli(
        ["skills", "new", "recovery-skill", "--owner", "@test", "--non-interactive"],
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

  it("allows a pack to become empty without an override flag", async () => {
    const workspace = createTempDir();
    try {
      const setup = await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
        {
          cwd: workspace.path,
        },
      );
      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
      const settingsPath = path.join(workspace.path, "axm.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      fs.writeFileSync(
        settingsPath,
        `${JSON.stringify({ ...settings, owner: "@test" }, null, 2)}\n`,
      );
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

      const removed = await runCli(
        [
          "packs",
          "remove",
          "recovery-pack",
          "@test/skills/pack-member",
          "--non-interactive",
          "--json",
        ],
        { cwd: workspace.path },
      );
      expect(removed.exitCode, removed.stdout + removed.stderr).toBe(0);
      expect(snapshotWorkspace(workspace.path)).not.toEqual(before);
    } finally {
      workspace.cleanup();
    }
  });
});
