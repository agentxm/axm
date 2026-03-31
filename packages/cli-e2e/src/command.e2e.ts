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

      expect(output).toContain("init");
      expect(output).toContain("skills");
    });

    it("displays examples", async () => {
      const result = await runCli([]);
      const output = getOutput(result);

      expect(output).toContain("EXAMPLES");
      expect(output).toContain("axm init");
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
});

describe("main CLI help", () => {
  it("shows the extended root help surface", async () => {
    const result = await runCli([]);
    const output = getOutput(result);

    expect(result.exitCode).toBe(0);
    expect(output).toContain("Open extension manager for AI coding agents.");
    expect(output).toContain("skills");
    expect(output).toContain("packs");
    expect(output).toContain("commands");
    expect(output).toContain("mcp-servers");
    expect(output).toContain("auth");
  });

  it("shows root help examples", async () => {
    const result = await runCli(["--help"]);
    const output = getOutput(result);

    expect(result.exitCode).toBe(0);
    expect(output).toContain("EXAMPLES");
    expect(output).toContain("axm init");
    expect(output).toContain("axm skills install @acme/skills/code-review");
    expect(output).toContain("axm whoami");
  });

  it.each([
    { args: ["skills"], expected: ["install", "list", "publish"] },
    { args: ["packs"], expected: ["install", "publish", "unpack"] },
    { args: ["commands"], expected: ["install", "uninstall"] },
    { args: ["mcp-servers"], expected: ["install", "uninstall"] },
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
    { args: ["init", "--help"], expected: ["--scope", "--agent"] },
    { args: ["whoami", "--help"], expected: ["--json"] },
    { args: ["skills", "install", "--help"], expected: ["--skill", "--all"] },
    { args: ["skills", "ls", "--help"], expected: ["List installed skills"] },
    { args: ["packs", "unpack", "--help"], expected: ["--strict-agent-sync"] },
    { args: ["commands", "install", "--help"], expected: ["--scope"] },
    { args: ["mcp-servers", "install", "--help"], expected: ["--scope"] },
  ])("shows leaf help for $args", async ({ args, expected }) => {
    const result = await runCli(args);
    const output = getOutput(result);

    expect(result.exitCode).toBe(0);
    for (const text of expected) {
      expect(output).toContain(text);
    }
  });
});
