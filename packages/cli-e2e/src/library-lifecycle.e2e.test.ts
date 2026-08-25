import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "./e2e/utils.js";

const libraryRef = "@acme/libraries/frontend";

const snapshotAxmState = (workspace: string): Readonly<Record<string, string>> => {
  const snapshot: Record<string, string> = {};
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        snapshot[path.relative(workspace, absolutePath)] = fs.readFileSync(absolutePath, "utf8");
      } else {
        snapshot[path.relative(workspace, absolutePath)] = entry.isSymbolicLink()
          ? `symlink:${fs.readlinkSync(absolutePath)}`
          : "other";
      }
    }
  };
  visit(workspace);
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
      const setup = await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code"],
        {
          cwd: workspace.path,
        },
      );
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
      const setup = await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code"],
        {
          cwd: workspace.path,
        },
      );
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

  it("omits source-disposition flags from every uninstall help surface", async () => {
    const commands: ReadonlyArray<ReadonlyArray<string>> = [
      ["uninstall", "--help"],
      ...["skills", "mcps", "subagents", "rules", "hooks", "knowledge", "packs"].map(
        (namespace) => [namespace, "uninstall", "--help"],
      ),
    ];

    for (const command of commands) {
      const result = await runCli(command);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("--scope");
      expect(result.stdout).not.toContain("--keep-source");
      expect(result.stdout).not.toContain("--delete-source");
    }
  });

  it("rejects removed source-disposition flags before workspace mutation", async () => {
    const workspace = createTempDir();

    try {
      const setup = await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code"],
        {
          cwd: workspace.path,
        },
      );
      expect(setup.exitCode).toBe(0);
      const invocations: ReadonlyArray<ReadonlyArray<string>> = [
        ["uninstall", "@acme/skills/example"],
        ...["skills", "mcps", "subagents", "rules", "hooks", "knowledge", "packs"].map(
          (namespace) => [namespace, "uninstall", "example"],
        ),
      ];

      for (const invocation of invocations) {
        for (const flag of ["--keep-source", "--delete-source"] as const) {
          const before = snapshotAxmState(workspace.path);
          const result = await runCli([...invocation, flag], { cwd: workspace.path });

          expect(result.exitCode).not.toBe(0);
          expect(result.stderr).toContain(flag);
          expect(snapshotAxmState(workspace.path)).toEqual(before);
        }
      }
    } finally {
      workspace.cleanup();
    }
  });
});
