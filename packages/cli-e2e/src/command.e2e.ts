/**
 * E2E tests for the `axm` root command.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "./e2e/utils.js";

/**
 * Get combined output from CLI result.
 * Help output may go to stdout or stderr depending on the execution path.
 */
function getOutput(result: { stdout: string; stderr: string }): string {
  return result.stdout + result.stderr;
}

describe("axm (root command)", () => {
  describe("without arguments", () => {
    it("exits with code 0", async () => {
      const result = await runCli([]);

      expect(result.exitCode).toBe(0);
    });

    it("displays available commands", async () => {
      const result = await runCli([]);
      const output = getOutput(result);

      expect(output).toContain("setup");
      expect(output).toContain("skills");
    });
  });

  describe("--help", () => {
    it("displays the same help information as running without arguments", async () => {
      const resultNoArgs = await runCli([]);
      const resultWithHelp = await runCli(["--help"]);

      expect(resultWithHelp.exitCode).toBe(0);
      // Both should display the same help content
      expect(getOutput(resultWithHelp)).toBe(getOutput(resultNoArgs));
    });
  });

  describe("help", () => {
    it("lists help topics without top-level command help", async () => {
      const resultWithHelp = await runCli(["help"]);
      const output = getOutput(resultWithHelp);

      expect(resultWithHelp.exitCode).toBe(0);
      expect(output).toContain("Topic");
      expect(output).toContain("Description");
      expect(output).toContain("axm help <topic>");
      expect(output).toContain("basic-usage");
      expect(output).toContain("getting-started");
      expect(output).toContain("exit-codes");
      expect(output).not.toContain("GETTING STARTED COMMANDS");
      expect(output).not.toContain("EXTENSIONS COMMANDS");
    });

    it("prints bundled markdown topics", async () => {
      const result = await runCli(["help", "basic-usage"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("# Basic usage");
      expect(result.stdout).toContain("axm view");
    });

    it("fails for unknown topic and command paths and points to the help index", async () => {
      const result = await runCli(["help", "bogus"]);
      const output = getOutput(result);

      expect(result.exitCode).toBe(3);
      expect(output).toContain("Unknown help topic or command path 'bogus'");
      expect(output).toContain("axm help");
      expect(output).not.toContain("axm publish --help");
    });

    it("resolves command-shaped paths to command help", async () => {
      const result = await runCli(["help", "publish"]);
      const output = getOutput(result);

      expect(result.exitCode).toBe(0);
      expect(output).toContain("Publish project-workspace extensions to a registry");
      expect(output).toContain("axm publish [flags] [<selectors...>]");
      expect(output).toContain("--authored");
    });

    it("emits command help as a formatter-owned machine document", async () => {
      const result = await runCli(["help", "publish", "--json"]);
      const document: unknown = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(document).toMatchObject({
        type: "help",
        description: "Publish project-workspace extensions to a registry",
        usage: "axm publish [flags] [<selectors...>]",
      });
      expect(result.stderr).toBe("");
    });
  });
});

describe("main CLI help", () => {
  it("shows the extended root help surface", async () => {
    const result = await runCli([]);
    const output = getOutput(result);

    expect(result.exitCode).toBe(0);
    expect(output).toContain("Agent Extension Manager");
    expect(output).toContain("EXTENSIONS");
    expect(output).toContain("WORKSPACE");
    expect(output).toContain("AUTH");
    expect(output).toContain("START HERE");
    expect(output).toContain("skills");
    expect(output).toContain("packs");
    expect(output).toContain("mcps");
    expect(output).toContain("agents");
  });

  it.each([
    { args: ["skills"], expected: ["install", "list", "publish"] },
    { args: ["packs"], expected: ["install", "publish", "unpack"] },
    { args: ["mcps"], expected: ["install", "uninstall"] },
    { args: ["auth"], expected: ["login", "whoami", "token"] },
  ])("shows group help for $args", async ({ args, expected }) => {
    const result = await runCli(args);
    const output = getOutput(result);

    expect(result.exitCode).toBe(0);
    for (const text of expected) {
      expect(output).toContain(text);
    }
  });

  it.each([
    { args: ["setup", "--help"], expected: ["--scope", "--agent"] },
    { args: ["whoami", "--help"], expected: ["--json"] },
    { args: ["skills", "install", "--help"], expected: ["--skill", "--all"] },
    { args: ["subagents", "install", "--help"], expected: ["--subagent", "--all"] },
    {
      args: ["skills", "ls", "--help"],
      expected: ["List detected skills", "--agent"],
    },
    { args: ["packs", "unpack", "--help"], expected: ["--preview"] },
    { args: ["mcps", "install", "--help"], expected: ["--scope"] },
  ])("shows leaf help for $args", async ({ args, expected }) => {
    const result = await runCli(args);
    const output = getOutput(result);

    expect(result.exitCode).toBe(0);
    for (const text of expected) {
      expect(output).toContain(text);
    }
  });

  it("does not show the removed --agent flag on subagents install", async () => {
    const result = await runCli(["subagents", "install", "--help"]);
    const output = getOutput(result);

    expect(result.exitCode).toBe(0);
    expect(output).not.toContain("--agent");
  });

  it.each([
    { args: ["skills", "update", "--skill", "example"], removedFlag: "--skill" },
    { args: ["subagents", "update", "--subagent", "example"], removedFlag: "--subagent" },
  ])("rejects the removed $removedFlag update selector", async ({ args, removedFlag }) => {
    const result = await runCli(args);
    const output = getOutput(result);

    expect(result.exitCode).toBe(2);
    expect(output).toContain(removedFlag);
    expect(output).toContain("--name");
  });

  it("does not expose bypass flags on packs unpack", async () => {
    const result = await runCli(["packs", "unpack", "--help"]);
    const output = getOutput(result);

    expect(result.exitCode).toBe(0);
    expect(output).not.toContain("--strict-agent-sync");
    expect(output).not.toContain("--force");
  });

  it("uses add/install/uninstall as the only MCP configuration grammar", async () => {
    const groupHelp = await runCli(["mcps"]);
    const importHelp = await runCli(["mcps", "import", "--help"]);
    const addHelp = await runCli(["mcps", "add", "--help"]);

    expect(groupHelp.exitCode).toBe(0);
    expect(getOutput(groupHelp)).toContain("uninstall");
    expect(getOutput(groupHelp)).not.toMatch(/^\s+remove\b/mu);
    expect(importHelp.exitCode).toBe(0);
    expect(getOutput(importHelp)).not.toContain("--force");
    expect(addHelp.exitCode).toBe(0);
    expect(getOutput(addHelp)).toContain("Add an inline MCP server");
  });

  it("rejects the removed mcps remove command with uninstall guidance and zero mutation", async () => {
    const workspace = createTempDir();
    try {
      const setup = await runCli(["setup", "--yes", "--agent", "claude-code"], {
        cwd: workspace.path,
      });
      expect(setup.exitCode).toBe(0);
      const settingsPath = path.join(workspace.path, ".axm", "settings.json");
      const lockfilePath = path.join(workspace.path, ".axm", "axm-lock.yaml");
      const before = {
        settings: fs.readFileSync(settingsPath, "utf8"),
        lockfile: fs.readFileSync(lockfilePath, "utf8"),
      };

      const result = await runCli(["mcps", "remove", "demo"], { cwd: workspace.path });

      expect(result.exitCode).not.toBe(0);
      expect(getOutput(result)).toContain("uninstall");
      expect(fs.readFileSync(settingsPath, "utf8")).toBe(before.settings);
      expect(fs.readFileSync(lockfilePath, "utf8")).toBe(before.lockfile);
    } finally {
      workspace.cleanup();
    }
  });

  it("keeps the inline MCP lifecycle idempotent and workspace state clean", async () => {
    const workspace = createTempDir();
    try {
      const setup = await runCli(["setup", "--yes", "--agent", "claude-code"], {
        cwd: workspace.path,
      });
      expect(setup.exitCode).toBe(0);

      const addArgs = ["mcps", "add", "demo", "--command", "node server.js", "--yes", "--json"];
      const firstAdd = await runCli(addArgs, { cwd: workspace.path });
      const secondAdd = await runCli(addArgs, { cwd: workspace.path });
      expect(firstAdd.exitCode).toBe(0);
      expect(JSON.parse(firstAdd.stdout)).toMatchObject({ result: { outcome: "applied" } });
      expect(secondAdd.exitCode).toBe(0);
      expect(JSON.parse(secondAdd.stdout)).toMatchObject({ result: { outcome: "no-op" } });

      const lint = await runCli(["lint", "--json"], { cwd: workspace.path });
      expect(lint.exitCode).toBe(0);

      const nativeConfigPath = path.join(workspace.path, ".mcp.json");
      const nativeConfig = JSON.parse(fs.readFileSync(nativeConfigPath, "utf8"));
      nativeConfig.mcpServers.keep = { command: "node", args: ["keep.js"] };
      fs.writeFileSync(nativeConfigPath, `${JSON.stringify(nativeConfig, null, 2)}\n`);

      const uninstallArgs = ["mcps", "uninstall", "demo", "--yes", "--json"];
      const firstUninstall = await runCli(uninstallArgs, { cwd: workspace.path });
      const secondUninstall = await runCli(uninstallArgs, { cwd: workspace.path });
      expect(firstUninstall.exitCode).toBe(0);
      expect(JSON.parse(firstUninstall.stdout)).toMatchObject({ result: { outcome: "applied" } });
      expect(secondUninstall.exitCode).toBe(0);
      expect(JSON.parse(secondUninstall.stdout)).toMatchObject({ result: { outcome: "no-op" } });

      const afterUninstall = JSON.parse(fs.readFileSync(nativeConfigPath, "utf8"));
      expect(afterUninstall.mcpServers.demo).toBeUndefined();
      expect(afterUninstall.mcpServers.keep).toEqual({ command: "node", args: ["keep.js"] });
    } finally {
      workspace.cleanup();
    }
  });
});
