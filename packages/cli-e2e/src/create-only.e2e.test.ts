import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { createTempDir, runCli } from "./e2e/utils.js";

const OWNER = "@test";
const CREATE_TYPES = [
  "skills",
  "mcps",
  "subagents",
  "packs",
  "rules",
  "hooks",
  "knowledge",
] as const;

const snapshotTree = (root: string): Readonly<Record<string, string>> => {
  const snapshot: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isSymbolicLink()) {
        snapshot[path.relative(root, absolutePath)] = `symlink:${fs.readlinkSync(absolutePath)}`;
      } else {
        snapshot[path.relative(root, absolutePath)] = fs
          .readFileSync(absolutePath)
          .toString("base64");
      }
    }
  };
  visit(root);
  return snapshot;
};

const initializeWorkspace = async (workspace: string): Promise<void> => {
  const setup = await runCli(["setup", "--yes", "--non-interactive"], { cwd: workspace });
  expect(setup.exitCode).toBe(0);
  const settingsPath = path.join(workspace, ".axm", "settings.json");
  const settings: Record<string, unknown> = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  fs.writeFileSync(
    settingsPath,
    `${JSON.stringify({ ...settings, owner: OWNER, agents: [] }, null, 2)}\n`,
  );
};

describe("create-only extension commands", () => {
  it("rejects every partial scaffold destination without changing a byte", async () => {
    const workspace = createTempDir();
    try {
      await initializeWorkspace(workspace.path);

      for (const type of CREATE_TYPES) {
        const name = `partial-${type}`;
        const destination = path.join(workspace.path, ".axm", "extensions", OWNER, type, name);
        fs.mkdirSync(destination, { recursive: true });
        fs.writeFileSync(path.join(destination, "keep.bin"), Buffer.from([0, 1, 2, 255]));
        const before = snapshotTree(workspace.path);

        const result = await runCli([type, "new", name, "--yes"], { cwd: workspace.path });

        expect(result.exitCode, `${type} new`).not.toBe(0);
        expect(result.stdout + result.stderr).toContain("destination already exists");
        expect(snapshotTree(workspace.path), `${type} new`).toEqual(before);
      }
    } finally {
      workspace.cleanup();
    }
  });

  it("rejects settings identity and skill-copy destination collisions without mutation", async () => {
    const workspace = createTempDir();
    try {
      await initializeWorkspace(workspace.path);
      const settingsPath = path.join(workspace.path, ".axm", "settings.json");
      const settings: Record<string, unknown> = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      fs.writeFileSync(
        settingsPath,
        `${JSON.stringify(
          {
            ...settings,
            skills: { configured: "workspace:@test/skills/configured" },
          },
          null,
          2,
        )}\n`,
      );
      const beforeSettingsCollision = snapshotTree(workspace.path);

      const configured = await runCli(["skills", "new", "configured", "--yes"], {
        cwd: workspace.path,
      });

      expect(configured.exitCode).not.toBe(0);
      expect(configured.stdout + configured.stderr).toContain("already exists in settings");
      expect(snapshotTree(workspace.path)).toEqual(beforeSettingsCollision);

      const source = path.join(workspace.path, "source-skill");
      fs.mkdirSync(source, { recursive: true });
      fs.writeFileSync(
        path.join(source, "SKILL.md"),
        "---\nname: source-skill\ndescription: Source\n---\n\nSource\n",
      );
      const destination = path.join(
        workspace.path,
        ".axm",
        "extensions",
        OWNER,
        "skills",
        "copied",
      );
      fs.mkdirSync(destination, { recursive: true });
      fs.writeFileSync(path.join(destination, "keep.txt"), "keep\n");
      const beforeCopyCollision = snapshotTree(workspace.path);

      const copied = await runCli(["skills", "copy", source, `${OWNER}/skills/copied`, "--yes"], {
        cwd: workspace.path,
      });

      expect(copied.exitCode).not.toBe(0);
      expect(copied.stdout + copied.stderr).toContain("destination already exists");
      expect(snapshotTree(workspace.path)).toEqual(beforeCopyCollision);
    } finally {
      workspace.cleanup();
    }
  });

  it("keeps previews side-effect-free and names every scaffold destination", async () => {
    const workspace = createTempDir();
    try {
      await initializeWorkspace(workspace.path);

      for (const type of CREATE_TYPES) {
        const name = `preview-${type}`;
        const before = snapshotTree(workspace.path);
        const result = await runCli([type, "new", name, "--preview", "--yes"], {
          cwd: workspace.path,
        });

        expect(result.exitCode, `${type} new --preview`).toBe(0);
        expect(result.stdout + result.stderr).toContain(
          path.join(".axm", "extensions", OWNER, type, name),
        );
        expect(snapshotTree(workspace.path), `${type} new --preview`).toEqual(before);
      }
    } finally {
      workspace.cleanup();
    }
  });
});
