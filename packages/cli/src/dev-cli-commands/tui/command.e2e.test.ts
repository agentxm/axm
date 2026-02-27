/**
 * E2E tests for the `axm-dev tui` command and its sub-commands.
 */

import { describe, expect, it } from "vitest";
import { runDevCli } from "../../e2e/utils.js";

/**
 * Get combined output from CLI result.
 * Help output may go to stdout (--help) or stderr (yargs showHelp).
 */
function getOutput(result: { stdout: string; stderr: string }): string {
  return result.stdout + result.stderr;
}

describe("axm-dev (root command)", () => {
  describe("without arguments", () => {
    it("exits with code 1 (demandCommand requires a subcommand)", async () => {
      const result = await runDevCli([]);

      expect(result.exitCode).toBe(1);
    });

    it("displays available commands", async () => {
      const result = await runDevCli([]);
      const output = getOutput(result);

      expect(output).toContain("tui");
    });
  });

  describe("--help", () => {
    it("displays help information", async () => {
      const result = await runDevCli(["--help"]);

      expect(result.exitCode).toBe(0);
      expect(getOutput(result)).toContain("tui");
    });
  });
});

describe("axm-dev tui", () => {
  describe("without arguments", () => {
    it("prompts for a sub-command", async () => {
      const result = await runDevCli(["tui"]);
      const output = getOutput(result);

      expect(output).toContain("Please specify a TUI component to demo");
    });
  });

  describe("--help", () => {
    it("shows all sub-commands", async () => {
      const result = await runDevCli(["tui", "--help"]);
      const output = getOutput(result);

      expect(result.exitCode).toBe(0);
      expect(output).toContain("log");
      expect(output).toContain("spinner");
      expect(output).toContain("note");
      expect(output).toContain("text-input");
      expect(output).toContain("password-input");
      expect(output).toContain("confirm");
      expect(output).toContain("select");
      expect(output).toContain("multiselect");
    });
  });

  describe("tui log", () => {
    it("exits with code 0", async () => {
      const result = await runDevCli(["tui", "log"]);

      expect(result.exitCode).toBe(0);
    });

    it("displays all clack log variants", async () => {
      const result = await runDevCli(["tui", "log"]);
      const output = getOutput(result);

      expect(output).toContain("This is an info message");
      expect(output).toContain("This is a warning message");
      expect(output).toContain("This is an error message");
      expect(output).toContain("This is a success message");
      expect(output).toContain("This is a plain message");
    });
  });

  describe("tui spinner", () => {
    it("exits with code 0", async () => {
      const result = await runDevCli(["tui", "spinner"], { timeout: 10000 });

      expect(result.exitCode).toBe(0);
    });

    it("displays completion message", async () => {
      const result = await runDevCli(["tui", "spinner"], { timeout: 10000 });
      const output = getOutput(result);

      expect(output).toContain("Done loading!");
    });
  });

  describe("tui note", () => {
    it("exits with code 0", async () => {
      const result = await runDevCli(["tui", "note"]);

      expect(result.exitCode).toBe(0);
    });

    it("displays clack note output", async () => {
      const result = await runDevCli(["tui", "note"]);
      const output = getOutput(result);

      expect(output).toContain("Welcome");
      expect(output).toContain("note with a title");
      expect(output).toContain("note without a title");
    });
  });

  // Interactive commands: test --help since they block on stdin
  describe.each([
    { command: "text-input", description: "Demo text input" },
    { command: "password-input", description: "Demo password input" },
    { command: "confirm", description: "Demo confirm prompt" },
    { command: "select", description: "Demo select prompt" },
    { command: "multiselect", description: "Demo multiselect prompt" },
  ])("tui $command", ({ command, description }) => {
    it("displays help with --help", async () => {
      const result = await runDevCli(["tui", command, "--help"]);
      const output = getOutput(result);

      expect(result.exitCode).toBe(0);
      expect(output).toContain(description);
    });
  });
});
