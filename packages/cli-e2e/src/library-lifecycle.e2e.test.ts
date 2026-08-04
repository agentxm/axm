import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "./e2e/utils.js";

const libraryRef = "@acme/libraries/frontend";

const snapshotAxmState = (workspace: string): Readonly<Record<string, string>> => {
  const axmDir = path.join(workspace, ".axm");
  const snapshot: Record<string, string> = {};
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else {
        snapshot[path.relative(axmDir, absolutePath)] = fs.readFileSync(absolutePath, "utf8");
      }
    }
  };
  visit(axmDir);
  return snapshot;
};

describe("Library lifecycle commands", () => {
  it.each([
    ["install", "cannot be installed"],
    ["update", "cannot be updated"],
    ["uninstall", "cannot be uninstalled"],
  ] as const)("rejects axm %s without mutating workspace state", async (command, message) => {
    const workspace = createTempDir();

    try {
      const setup = await runCli(["setup", "--yes", "--agent", "claude-code"], {
        cwd: workspace.path,
      });
      expect(setup.exitCode).toBe(0);
      const before = snapshotAxmState(workspace.path);

      const result = await runCli([command, libraryRef], { cwd: workspace.path });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain(message);
      expect(snapshotAxmState(workspace.path)).toEqual(before);
    } finally {
      workspace.cleanup();
    }
  });

  it("rejects the removed root install --frozen flag", async () => {
    const workspace = createTempDir();

    try {
      const setup = await runCli(["setup", "--yes", "--agent", "claude-code"], {
        cwd: workspace.path,
      });
      expect(setup.exitCode).toBe(0);
      const before = snapshotAxmState(workspace.path);

      const result = await runCli(["install", "--frozen", libraryRef], {
        cwd: workspace.path,
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("--frozen");
      expect(snapshotAxmState(workspace.path)).toEqual(before);
    } finally {
      workspace.cleanup();
    }
  });
});
