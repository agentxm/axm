import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "./e2e/utils.js";

const writeJson = (filePath: string, value: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

const readJson = (filePath: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(filePath, "utf8"));

const createKnowledgePackage = (packageRoot: string) => {
  writeJson(path.join(packageRoot, "knowledge.json"), {
    owner: "@acme",
    type: "knowledge",
    name: "platform",
    version: "1.0.0",
    format: { name: "okf", version: "0.2" },
    bundleRoot: "src",
  });
  fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "src", "index.md"),
    '---\nokf_version: "0.2"\n---\n# Platform knowledge\n',
  );
  fs.writeFileSync(
    path.join(packageRoot, "src", "architecture.md"),
    "---\ntype: reference\ndescription: Platform architecture\n---\n# Architecture\n",
  );
};

describe("axm knowledge lifecycle", () => {
  it("converges configured local Knowledge through install, update, sync, activation, and uninstall", async () => {
    const temp = createTempDir();

    try {
      const sourceRoot = path.join(temp.path, "knowledge-source");
      createKnowledgePackage(sourceRoot);
      await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });

      const settingsPath = path.join(temp.path, ".axm", "settings.json");
      writeJson(settingsPath, {
        ...readJson(settingsPath),
        agents: [],
        knowledge: {
          platform: { source: "./knowledge-source", enabled: true },
        },
      });

      const install = await runCli(["knowledge", "install", "--yes", "--non-interactive"], {
        cwd: temp.path,
      });
      expect({
        exitCode: install.exitCode,
        output: install.stdout + install.stderr,
      }).toEqual({ exitCode: 0, output: expect.any(String) });
      expect(install.stdout + install.stderr).not.toContain("No configured extensions");

      const canonical = path.join(
        temp.path,
        ".axm",
        "extensions",
        "external",
        "knowledge",
        "platform",
      );
      const defaultProjection = path.join(temp.path, ".agents", "knowledge", "@acme", "platform");
      expect(fs.existsSync(path.join(canonical, "src", "architecture.md"))).toBe(true);
      expect(fs.existsSync(path.join(defaultProjection, "architecture.md"))).toBe(true);
      expect(fs.existsSync(path.join(defaultProjection, "knowledge.json"))).toBe(false);
      expect(fs.readFileSync(path.join(temp.path, ".axm", "axm-lock.yaml"), "utf8")).toContain(
        "platform:",
      );
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).toContain(
        "untrusted reference material",
      );

      fs.writeFileSync(
        path.join(sourceRoot, "src", "architecture.md"),
        "---\ntype: reference\ndescription: Updated platform architecture\n---\n# Updated architecture\n",
      );
      const update = await runCli(["knowledge", "update", "--yes", "--non-interactive"], {
        cwd: temp.path,
      });
      expect(update.exitCode).toBe(0);
      expect(fs.readFileSync(path.join(canonical, "src", "architecture.md"), "utf8")).toContain(
        "Updated architecture",
      );
      expect(fs.readFileSync(path.join(temp.path, ".axm", "axm-lock.yaml"), "utf8")).toContain(
        "platform:",
      );

      writeJson(settingsPath, {
        ...readJson(settingsPath),
        knowledgeConfig: { directory: "docs/agent-knowledge" },
      });
      const preview = await runCli(["sync", "--dry-run", "--non-interactive"], {
        cwd: temp.path,
      });
      expect(preview.exitCode).toBe(0);
      expect(fs.existsSync(defaultProjection)).toBe(true);
      expect(fs.existsSync(path.join(temp.path, "docs", "agent-knowledge"))).toBe(false);

      const sync = await runCli(["sync", "--non-interactive"], { cwd: temp.path });
      expect({ exitCode: sync.exitCode, output: sync.stdout + sync.stderr }).toEqual({
        exitCode: 0,
        output: expect.any(String),
      });
      const relocated = path.join(temp.path, "docs", "agent-knowledge", "@acme", "platform");
      expect({
        relocated: fs.existsSync(relocated),
        output: sync.stdout + sync.stderr,
      }).toEqual({ relocated: true, output: expect.any(String) });
      expect(fs.existsSync(defaultProjection)).toBe(false);

      const disable = await runCli(["knowledge", "disable", "platform"], { cwd: temp.path });
      expect(disable.exitCode, disable.stdout + disable.stderr).toBe(0);
      expect(fs.existsSync(relocated)).toBe(false);
      expect(fs.existsSync(canonical)).toBe(true);

      const enable = await runCli(["knowledge", "enable", "platform"], { cwd: temp.path });
      expect(enable.exitCode, enable.stdout + enable.stderr).toBe(0);
      expect(fs.existsSync(relocated)).toBe(true);

      const uninstall = await runCli(
        ["knowledge", "uninstall", "platform", "--yes", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(uninstall.exitCode).toBe(0);
      expect(fs.existsSync(relocated)).toBe(false);
      expect(fs.existsSync(canonical)).toBe(false);
    } finally {
      temp.cleanup();
    }
  }, 30_000);
});
