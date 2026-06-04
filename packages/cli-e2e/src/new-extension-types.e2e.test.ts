import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "./e2e/utils.js";

const readJson = (filePath: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(filePath, "utf-8"));

const writeJson = (filePath: string, value: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

const configureWorkspace = (
  workspacePath: string,
  update: (settings: Record<string, unknown>) => Record<string, unknown>,
) => {
  const settingsPath = path.join(workspacePath, ".axm", "settings.json");
  writeJson(settingsPath, update(readJson(settingsPath)));
};

describe("axm files new", () => {
  it("scaffolds, registers, writes lockfile, and materializes the target file", async () => {
    const temp = createTempDir();

    try {
      await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });
      configureWorkspace(temp.path, (settings) => ({
        ...settings,
        owner: "@test",
        agents: [],
      }));

      const result = await runCli(["files", "new", "workspace-baseline", "--yes"], {
        cwd: temp.path,
      });
      expect(result.exitCode).toBe(0);

      const packageDir = path.join(
        temp.path,
        ".axm",
        "extensions",
        "@test",
        "files",
        "workspace-baseline",
      );
      expect(fs.existsSync(path.join(packageDir, "files.json"))).toBe(true);
      expect(fs.existsSync(path.join(packageDir, "src", "README.md"))).toBe(true);
      expect(fs.readFileSync(path.join(temp.path, "files", "workspace-baseline.md"), "utf-8")).toBe(
        "# workspace-baseline\n",
      );

      const settings = readJson(path.join(temp.path, ".axm", "settings.json"));
      expect(settings["files"]).toEqual({
        "workspace-baseline": {
          source: "@test/files/workspace-baseline",
          authored: true,
        },
      });

      const lockfile = fs.readFileSync(path.join(temp.path, ".axm", "axm-lock.yaml"), "utf-8");
      expect(lockfile).toContain("workspace-baseline:");
      expect(lockfile).toContain("resolvedVersion: 0.1.0");
      expect(result.stdout + result.stderr).toContain(
        "Edit `.axm/extensions/@test/files/workspace-baseline/src/README.md`",
      );
    } finally {
      temp.cleanup();
    }
  });
});

describe("axm mcps new", () => {
  it("scaffolds, registers, and writes lockfile for an authored MCP server", async () => {
    const temp = createTempDir();

    try {
      await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });
      configureWorkspace(temp.path, (settings) => ({
        ...settings,
        owner: "@test",
        agents: [],
      }));

      const result = await runCli(
        ["mcps", "new", "context", "--description", "Context server", "--yes"],
        { cwd: temp.path },
      );
      expect(result.exitCode).toBe(0);

      const packageDir = path.join(temp.path, ".axm", "extensions", "@test", "mcps", "context");
      const manifest = readJson(path.join(packageDir, "mcp-server.json"));
      expect(manifest["owner"]).toBe("@test");
      expect(manifest["type"]).toBe("mcp-server");
      expect(manifest["name"]).toBe("context");
      expect(manifest["version"]).toBe("0.1.0");

      const settings = readJson(path.join(temp.path, ".axm", "settings.json"));
      expect(settings["mcpServers"]).toEqual({
        context: {
          source: "@test/mcps/context",
          authored: true,
        },
      });

      const lockfile = fs.readFileSync(path.join(temp.path, ".axm", "axm-lock.yaml"), "utf-8");
      expect(lockfile).toContain("context:");
      expect(lockfile).toContain("resolvedVersion: 0.1.0");
      expect(result.stdout + result.stderr).toContain(
        "Edit `.axm/extensions/@test/mcps/context/mcp-server.json`",
      );
    } finally {
      temp.cleanup();
    }
  });
});
