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
    description: "Platform architecture and operational guidance.",
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
      expect(fs.existsSync(path.join(canonical, "src", "architecture.md"))).toBe(true);
      expect(fs.existsSync(path.join(temp.path, ".agents", "knowledge"))).toBe(false);
      expect(fs.readFileSync(path.join(temp.path, ".axm", "axm-lock.yaml"), "utf8")).toContain(
        "platform:",
      );
      const installedInstructions = fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8");
      expect(installedInstructions).toContain("## Knowledge Base");
      expect(installedInstructions).toContain("### @acme");
      expect(installedInstructions).toContain(
        "[platform](.axm/extensions/external/knowledge/platform/src/index.md)",
      );
      expect(installedInstructions).toContain("Platform architecture and operational guidance.");

      fs.writeFileSync(
        path.join(sourceRoot, "src", "architecture.md"),
        "---\ntype: reference\ndescription: Updated platform architecture\n---\n# Updated architecture\n",
      );
      writeJson(path.join(sourceRoot, "knowledge.json"), {
        ...readJson(path.join(sourceRoot, "knowledge.json")),
        description: "Updated platform guidance.",
      });
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
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).toContain(
        "Updated platform guidance.",
      );

      writeJson(settingsPath, {
        ...readJson(settingsPath),
        knowledgeConfig: { directory: "docs/legacy", ignore: ["old"] },
      });
      const legacyLint = await runCli(["lint", "--json"], { cwd: temp.path });
      expect(legacyLint.stdout).toContain("workspace/knowledge-config-current");
      const legacyFix = await runCli(["lint", "--fix", "--json"], {
        cwd: temp.path,
      });
      expect(legacyFix.exitCode, legacyFix.stdout + legacyFix.stderr).toBe(0);
      expect(readJson(settingsPath)["knowledgeConfig"]).toBeUndefined();

      writeJson(settingsPath, {
        ...readJson(settingsPath),
        knowledgeConfig: { instructions: false },
      });
      const preview = await runCli(["sync", "--preview", "--non-interactive"], {
        cwd: temp.path,
      });
      expect(preview.exitCode).toBe(0);
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).toContain(
        "## Knowledge Base",
      );

      const sync = await runCli(["sync", "--non-interactive"], { cwd: temp.path });
      expect({ exitCode: sync.exitCode, output: sync.stdout + sync.stderr }).toEqual({
        exitCode: 0,
        output: expect.any(String),
      });
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).not.toContain(
        "## Knowledge Base",
      );
      expect(fs.existsSync(canonical)).toBe(true);
      const searchWhileHidden = await runCli(["knowledge", "search", "architecture"], {
        cwd: temp.path,
      });
      expect(searchWhileHidden.exitCode).toBe(0);
      expect(searchWhileHidden.stdout).toContain("Updated architecture");

      writeJson(settingsPath, {
        ...readJson(settingsPath),
        knowledgeConfig: {},
      });
      const restoreTable = await runCli(["sync", "--non-interactive"], { cwd: temp.path });
      expect(restoreTable.exitCode, restoreTable.stdout + restoreTable.stderr).toBe(0);

      const disable = await runCli(["knowledge", "disable", "platform"], { cwd: temp.path });
      expect(disable.exitCode, disable.stdout + disable.stderr).toBe(0);
      expect(fs.existsSync(canonical)).toBe(true);
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).not.toContain(
        "[platform]",
      );

      const enable = await runCli(["knowledge", "enable", "platform"], { cwd: temp.path });
      expect(enable.exitCode, enable.stdout + enable.stderr).toBe(0);
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).toContain("[platform]");

      const uninstall = await runCli(
        ["knowledge", "uninstall", "platform", "--yes", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(uninstall.exitCode).toBe(0);
      expect(fs.existsSync(canonical)).toBe(false);
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).not.toContain(
        "[platform]",
      );
    } finally {
      temp.cleanup();
    }
  }, 60_000);
});
