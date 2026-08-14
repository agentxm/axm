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

describe("axm skills new", () => {
  it("preserves unrelated settings layout in a divergent workspace", async () => {
    const temp = createTempDir();

    try {
      await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });
      configureWorkspace(temp.path, (settings) => ({
        ...settings,
        owner: "@test",
        lint: { rules: {} },
      }));
      const settingsPath = path.join(temp.path, ".axm", "settings.json");
      const before = fs.readFileSync(settingsPath, "utf-8");

      const result = await runCli(["skills", "new", "layout-check", "--yes"], {
        cwd: temp.path,
      });

      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      const after = fs.readFileSync(settingsPath, "utf-8");
      const intendedEntry = ',\n    "layout-check": "workspace:@test/skills/layout-check"';
      expect(after).toContain(intendedEntry);
      expect(after.endsWith("\n")).toBe(true);
      expect(after.replace(intendedEntry, "").slice(0, -1)).toBe(before);
      expect(readJson(settingsPath)["skills"]).toMatchObject({
        "layout-check": "workspace:@test/skills/layout-check",
      });
    } finally {
      temp.cleanup();
    }
  });
});

describe("axm mcps new", () => {
  it("scaffolds and registers an authored MCP server without a lockfile row", async () => {
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
      expect(lockfile).toBe("lockfileVersion: 4\nskills: {}\n");
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
      await runCli(["setup", "--yes", "--non-interactive", "--agent", "claude-code"], {
        cwd: temp.path,
      });
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

      const recovered = await runCli(["sync", "@other/mcps/context"], { cwd: temp.path });
      expect(recovered.exitCode).toBe(0);
      expect(recovered.stdout + recovered.stderr).not.toContain("workspace:workspace:");

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

describe("axm knowledge new", () => {
  it("scaffolds a progressive-discovery root and accepts a bundle description", async () => {
    const temp = createTempDir();

    try {
      await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });
      configureWorkspace(temp.path, (settings) => ({
        ...settings,
        owner: "@test",
        agents: [],
      }));
      const description = "Platform authentication architecture and operational runbooks";
      const preview = await runCli(
        ["knowledge", "new", "platform", "--description", description, "--preview", "--json"],
        { cwd: temp.path },
      );
      expect(preview.exitCode, preview.stdout + preview.stderr).toBe(0);
      expect(preview.stdout).toContain(description);

      const created = await runCli(
        ["knowledge", "new", "platform", "--description", description, "--yes"],
        { cwd: temp.path },
      );
      expect(created.exitCode, created.stdout + created.stderr).toBe(0);
      const packageDir = path.join(
        temp.path,
        ".axm",
        "extensions",
        "@test",
        "knowledge",
        "platform",
      );
      expect(readJson(path.join(packageDir, "knowledge.json"))["description"]).toBe(description);
      expect(fs.readFileSync(path.join(packageDir, "src", "index.md"), "utf8")).toContain(
        "Discovery map",
      );

      const undescribed = await runCli(["knowledge", "new", "runbooks", "--yes"], {
        cwd: temp.path,
      });
      expect(undescribed.exitCode, undescribed.stdout + undescribed.stderr).toBe(0);
      expect(undescribed.stdout + undescribed.stderr).toContain("Add a concise bundle description");
      expect(undescribed.stdout + undescribed.stderr).toContain(
        "Replace the root index placeholder with grouped, annotated concept links",
      );
    } finally {
      temp.cleanup();
    }
  });
});
