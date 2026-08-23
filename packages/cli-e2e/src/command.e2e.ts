/**
 * E2E tests for the `axm` root command.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCommand } from "@agentxm/client-e2e-utils";
import { createTempDir, runCli } from "./e2e/utils.js";

/**
 * Get combined output from CLI result.
 * Help output may go to stdout or stderr depending on the execution path.
 */
function getOutput(result: { stdout: string; stderr: string }): string {
  return result.stdout + result.stderr;
}

// eslint-disable-next-line no-control-regex -- built output must not contain ANSI CSI or OSC sequences.
const terminalControlPattern = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/u;

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

    it("prints the dedicated publish topic", async () => {
      const result = await runCli(["help", "publish"]);
      const output = getOutput(result);
      const normalizedOutput = output.replace(/\s+/gu, " ");

      expect(result.exitCode).toBe(0);
      expect(output).toContain("# Publishing");
      expect(normalizedOutput).toContain("only extensions authored by the project workspace");
      expect(normalizedOutput).toContain(
        "fails as `not_authored` before AXM constructs an archive",
      );
      expect(output).toContain("--on-existing");
    });

    it("emits command help as a formatter-owned machine document", async () => {
      const result = await runCli(["publish", "--help", "--json"]);
      const document: unknown = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(document).toMatchObject({
        type: "help",
        description:
          "Publish project-workspace extensions to a registry (archive policy: axm help publish)",
        usage: "axm publish [flags] [<extension...>]",
      });
      expect(JSON.stringify(document)).not.toContain("--authored");
      expect(JSON.stringify(document)).not.toContain('"name":"all"');
      expect(JSON.stringify(document)).not.toMatch(/--include-dependency(?:[ =]|$)/u);
      expect(result.stderr).toBe("");
    });
  });
});

describe("global text-output policy", () => {
  it.each([
    { name: "non-TTY stdout", env: {} },
    { name: "NO_COLOR", env: { NO_COLOR: "1" } },
    { name: "FORCE_COLOR=0", env: { FORCE_COLOR: "0" } },
    { name: "CI", env: { CI: "1" } },
    { name: "TERM=dumb", env: { TERM: "dumb" } },
  ])("keeps root help plain under $name", async ({ env }) => {
    const result = await runCli(["--help"], { env });

    expect(result.exitCode).toBe(0);
    expect(terminalControlPattern.test(result.stdout)).toBe(false);
    expect(terminalControlPattern.test(result.stderr)).toBe(false);
  });

  it("gives quiet precedence while preserving mutation and no-op outcomes", async () => {
    const workspace = createTempDir();
    try {
      const args = [
        "setup",
        "--yes",
        "--scope",
        "project",
        "--agent",
        "claude-code",
        "--non-interactive",
        "--quiet",
        "--verbose",
        "--debug",
      ];
      const applied = await runCli(args, { cwd: workspace.path });
      const noOp = await runCli(args, { cwd: workspace.path });

      expect(applied.exitCode).toBe(0);
      expect(getOutput(applied)).toMatch(/setup|initialized|created/iu);
      expect(getOutput(applied)).not.toContain("Telemetry is enabled");
      expect(noOp.exitCode).toBe(0);
      expect(getOutput(noOp)).toMatch(/already|no changes|no-op/iu);
    } finally {
      workspace.cleanup();
    }
  });

  it("keeps validation and authentication recovery visible in quiet mode", async () => {
    const invalid = await runCli([
      "setup",
      "--scope",
      "invalid",
      "--quiet",
      "--verbose",
      "--debug",
    ]);
    const auth = await runCli(["token", "--quiet", "--verbose", "--debug"], {
      env: { AXM_TOKEN: "", AXM_TOKEN_FILE: "" },
    });

    expect(invalid.exitCode).not.toBe(0);
    expect(getOutput(invalid)).toMatch(/invalid|scope/iu);
    expect(auth.exitCode).not.toBe(0);
    expect(getOutput(auth)).toContain("No token available");
    expect(getOutput(auth)).toContain("axm login --device-code --json");
    expect(getOutput(auth)).toContain("https://agentxm.ai/u/settings/tokens");
  });

  it.each([
    { mode: "verbose", args: ["--verbose"] },
    { mode: "debug", args: ["--debug"] },
    { mode: "quiet precedence", args: ["--quiet", "--verbose", "--debug"] },
  ])("redacts built-runtime defects in human mode for $mode", async ({ args }) => {
    const fixture = fileURLToPath(new URL("./fixtures/machine-output-defect.mjs", import.meta.url));
    const result = await runCommand(process.execPath, [fixture, ...args], {});

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).not.toContain("e2e-secret-sentinel");
    expect(result.stderr).not.toContain("e2e-secret-sentinel");
    expect(result.stderr).toContain("[REDACTED]");
    expect(terminalControlPattern.test(result.stdout)).toBe(false);
    expect(terminalControlPattern.test(result.stderr)).toBe(false);
  });
});

describe("application exit-code contract", () => {
  const applicationExitCases = [
    { code: "issues", exitCode: 1 },
    { code: "usage", exitCode: 2 },
    { code: "not_found", exitCode: 3 },
    { code: "auth", exitCode: 4 },
    { code: "forbidden", exitCode: 5 },
    { code: "conflict", exitCode: 6 },
    { code: "rate_limit", exitCode: 7 },
    { code: "network", exitCode: 8 },
    { code: "validation", exitCode: 9 },
    { code: "internal", exitCode: 10 },
    { code: "unavailable", exitCode: 11 },
    { code: "quota", exitCode: 12 },
    { code: "auth_required", exitCode: 13 },
    { code: "auth_expired", exitCode: 14 },
    { code: "auth_denied", exitCode: 15 },
    { code: "timeout", exitCode: 16 },
  ] as const;

  it.each(applicationExitCases)(
    "emits the built-runtime discriminator and process status for $code",
    async ({ code, exitCode }) => {
      const fixture = fileURLToPath(new URL("./fixtures/app-error-exit.mjs", import.meta.url));
      const result = await runCommand(process.execPath, [fixture, code, "--json", "--quiet"], {});
      const document: unknown = JSON.parse(result.stdout);
      const stderrEvents: ReadonlyArray<unknown> = result.stderr
        .trim()
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line));

      expect(result.exitCode).toBe(exitCode);
      expect(document).toMatchObject({
        ok: false,
        code,
        detail: `Deterministic ${code} fixture`,
      });
      expect(stderrEvents.at(-1)).toEqual(expect.objectContaining({ type: "error", code }));

      if (code === "auth_required") {
        expect(document).toMatchObject({
          blockedOn: "human",
          action: { kind: "open-url" },
        });
      } else {
        expect(document).not.toHaveProperty("blockedOn");
      }
    },
  );

  it("keeps cache status flat inside the ordinary result envelope", async () => {
    const home = createTempDir();
    try {
      const result = await runCli(["cache", "status", "--json"], {
        env: { AXM_USER_HOME: home.path },
      });
      const document: unknown = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(document).toMatchObject({
        ok: true,
        result: { entries: 0, bytes: 0, maxBytes: 2_147_483_648, maxAgeDays: 90 },
      });
      expect(document).not.toHaveProperty("result.data");
    } finally {
      home.cleanup();
    }
  });
});

describe("axm instructions", () => {
  it("exposes inspection at root and only enable and disable subcommands", async () => {
    const help = await runCli(["instructions", "--help"]);
    const output = getOutput(help);

    expect(help.exitCode).toBe(0);
    expect(output).toContain("enable");
    expect(output).toContain("disable");
    expect(output).not.toMatch(/^\s+status\b/mu);
  });

  it("inspects the configured instruction-file state as JSON", async () => {
    const workspace = createTempDir();
    try {
      const setup = await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code"],
        { cwd: workspace.path },
      );
      expect(setup.exitCode).toBe(0);

      const result = await runCli(["instructions", "--json"], { cwd: workspace.path });
      const document: unknown = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(document).toMatchObject({
        ok: true,
        result: {
          enabled: true,
          sourceFileName: "AGENTS.md",
          items: expect.arrayContaining([expect.objectContaining({ agentId: "claude-code" })]),
        },
      });
      expect(
        result.stderr
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line)),
      ).toEqual([
        expect.objectContaining({ type: "progress", phase: "work", percent: 0 }),
        expect.objectContaining({ type: "progress", phase: "work", percent: 100 }),
      ]);
    } finally {
      workspace.cleanup();
    }
  });

  it.each([
    ["instructions", "status"],
    ["rules", "instructions"],
  ])("rejects the removed command path %s %s", async (...args) => {
    const result = await runCli(args);

    expect(result.exitCode).not.toBe(0);
    expect(getOutput(result)).toMatch(/Unknown (command|subcommand)/u);
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
    { args: ["agents"], expected: ["list", "add", "remove", "capabilities"] },
    { args: ["skills"], expected: ["install", "list", "publish"] },
    { args: ["subagents"], expected: ["install", "list", "publish"] },
    { args: ["packs"], expected: ["install", "publish", "unpack"] },
    { args: ["mcps"], expected: ["install", "uninstall"] },
    { args: ["rules"], expected: ["install", "list", "publish"] },
    { args: ["hooks"], expected: ["install", "show", "publish"] },
    { args: ["knowledge"], expected: ["install", "list", "concepts"] },
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
      args: ["skills", "list", "--help"],
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

  it.each([
    {
      args: ["list", "--help"],
      choices: "skill, mcp-server, subagent, rule, hook, knowledge, pack",
    },
    {
      args: ["publish", "--help"],
      choices: "skill, mcp-server, subagent, rule, hook, knowledge, pack",
    },
    {
      args: ["sync", "--help"],
      choices: "skill, mcp-server, subagent, rule, hook, knowledge",
    },
    {
      args: ["view", "--help"],
      choices: "skill, mcp-server, subagent, rule, hook, knowledge",
    },
  ])("renders capability-derived --type choices for $args", async ({ args, choices }) => {
    const result = await runCli(args);
    const output = getOutput(result).replace(/\s+/gu, " ");

    expect(result.exitCode).toBe(0);
    expect(output).toContain(`choices: ${choices}`);
  });

  it.each([
    ["agents", "ls"],
    ["agents", "rm"],
    ["skills", "ls"],
    ["subagents", "ls"],
    ["packs", "ls"],
    ["mcps", "ls"],
    ["rules", "ls"],
    ["hooks", "ls"],
    ["knowledge", "ls"],
  ])("rejects the removed command alias %s %s", async (...args) => {
    const result = await runCli(args);

    expect(result.exitCode).not.toBe(0);
    expect(getOutput(result)).toMatch(/Unknown (command|subcommand)/u);
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
      const setup = await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code"],
        {
          cwd: workspace.path,
        },
      );
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
      const setup = await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code"],
        {
          cwd: workspace.path,
        },
      );
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
