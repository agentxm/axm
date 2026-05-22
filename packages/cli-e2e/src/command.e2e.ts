/**
 * E2E tests for the `axm` root command.
 */

import { describe, expect, it } from "vitest";
import { runCli } from "./e2e/utils.js";

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

    it("fails for unknown topics and lists known topics", async () => {
      const result = await runCli(["help", "bogus"]);
      const output = getOutput(result);

      expect(result.exitCode).toBe(3);
      expect(output).toContain("Unknown help topic 'bogus'");
      expect(output).toContain("basic-usage");
    });
  });
});

describe("main CLI help", () => {
  it("shows the extended root help surface", async () => {
    const result = await runCli([]);
    const output = getOutput(result);

    expect(result.exitCode).toBe(0);
    expect(output).toContain("Agent Extension Manager");
    expect(output).toContain("CORE");
    expect(output).toContain("WORKSPACE");
    expect(output).toContain("AUTH");
    expect(output).toContain("START HERE");
    expect(output).toContain("skills");
    expect(output).toContain("packs");
    expect(output).toContain("commands");
    expect(output).toContain("mcps");
    expect(output).toContain("agents");
  });

  it.each([
    { args: ["skills"], expected: ["install", "list", "publish"] },
    { args: ["packs"], expected: ["install", "publish", "unpack"] },
    { args: ["commands"], expected: ["install", "uninstall"] },
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
    { args: ["skills", "ls", "--help"], expected: ["List installed skills"] },
    { args: ["packs", "unpack", "--help"], expected: ["--strict-agent-sync"] },
    { args: ["commands", "install", "--help"], expected: ["--scope"] },
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
});
