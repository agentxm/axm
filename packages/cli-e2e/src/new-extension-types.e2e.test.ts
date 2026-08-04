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
        "workspace-baseline": "workspace:@test/files/workspace-baseline",
      });

      const lockfile = fs.readFileSync(path.join(temp.path, ".axm", "axm-lock.yaml"), "utf-8");
      expect(lockfile).toContain("workspace-baseline:");
      expect(lockfile).toContain("type: workspace");
      expect(lockfile).toContain("version: 0.1.0");
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
      const manifest = readJson(path.join(packageDir, "mcp.json"));
      expect(manifest["owner"]).toBe("@test");
      expect(manifest["type"]).toBe("mcp-server");
      expect(manifest["name"]).toBe("context");
      expect(manifest["version"]).toBe("0.1.0");

      const settings = readJson(path.join(temp.path, ".axm", "settings.json"));
      expect(settings["mcpServers"]).toEqual({
        context: "workspace:@test/mcps/context",
      });

      const lockfile = fs.readFileSync(path.join(temp.path, ".axm", "axm-lock.yaml"), "utf-8");
      expect(lockfile).toContain("context:");
      expect(lockfile).toContain("type: workspace");
      expect(lockfile).toContain("version: 0.1.0");
      expect(result.stdout + result.stderr).toContain(
        "Edit `.axm/extensions/@test/mcps/context/mcp.json`",
      );
    } finally {
      temp.cleanup();
    }
  });

  it("recovers a relocated workspace-authored MCP server", async () => {
    const temp = createTempDir();

    try {
      await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });
      configureWorkspace(temp.path, (settings) => ({
        ...settings,
        owner: "@original",
        agents: ["claude-code"],
        lint: {
          rules: {
            "workspace/agents-detected-declared": "off",
            // Manifest-only MCP packages are tracked separately from this trust-recovery path.
            "workspace/configured-but-not-installed": "off",
          },
        },
      }));
      expect(
        (
          await runCli(["mcps", "new", "context", "--description", "Context server", "--yes"], {
            cwd: temp.path,
          })
        ).exitCode,
      ).toBe(0);

      const originalDir = path.join(
        temp.path,
        ".axm",
        "extensions",
        "@original",
        "mcps",
        "context",
      );
      const relocatedDir = path.join(temp.path, ".axm", "extensions", "@other", "mcps", "context");
      fs.mkdirSync(path.dirname(relocatedDir), { recursive: true });
      fs.renameSync(originalDir, relocatedDir);
      writeJson(path.join(relocatedDir, "mcp.json"), {
        ...readJson(path.join(relocatedDir, "mcp.json")),
        owner: "@other",
      });
      configureWorkspace(temp.path, (settings) => ({
        ...settings,
        mcpServers: { context: "workspace:@other/mcps/context" },
      }));

      const status = await runCli(["status"], { cwd: temp.path });
      expect(status.exitCode).toBe(1);
      expect(status.stdout + status.stderr).toContain(
        "axm sync @other/mcps/context --accept-authority-change",
      );

      const refused = await runCli(["sync", "@other/mcps/context"], { cwd: temp.path });
      expect(refused.exitCode).toBe(1);
      expect(refused.stdout + refused.stderr).not.toContain("workspace:workspace:");
      expect(refused.stdout + refused.stderr).toContain(
        "axm sync @other/mcps/context --accept-authority-change",
      );

      const recovered = await runCli(["sync", "@other/mcps/context", "--accept-authority-change"], {
        cwd: temp.path,
      });
      expect(recovered.exitCode).toBe(0);

      const finalStatus = await runCli(["status"], { cwd: temp.path });
      expect(finalStatus.exitCode).toBe(0);
      const lint = await runCli(["lint"], { cwd: temp.path });
      expect(lint.exitCode).toBe(0);
    } finally {
      temp.cleanup();
    }
  });
});

describe("axm hooks new", () => {
  it("updates existing Claude Code settings without a workspace backup", async () => {
    const temp = createTempDir();

    try {
      await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });
      configureWorkspace(temp.path, (settings) => ({
        ...settings,
        owner: "@test",
        agents: ["claude-code"],
      }));

      const settingsPath = path.join(temp.path, ".claude", "settings.json");
      writeJson(settingsPath, {
        hooks: {
          Stop: [{ hooks: [{ type: "command", command: "echo keep" }] }],
        },
      });

      const result = await runCli(["hooks", "new", "tool-audit", "--owner", "@test", "--yes"], {
        cwd: temp.path,
      });
      expect(result.exitCode).toBe(0);

      const settings = readJson(settingsPath);
      expect(fs.existsSync(`${settingsPath}.bak`)).toBe(false);
      expect(settings["hooks"]).toBeDefined();
      expect(JSON.stringify(settings["hooks"])).toContain("echo keep");
      expect(JSON.stringify(settings["hooks"])).toContain("tool-audit");
    } finally {
      temp.cleanup();
    }
  });
});
