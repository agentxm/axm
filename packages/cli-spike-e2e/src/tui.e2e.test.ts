/**
 * E2E tests for the `axm-spike tui` command and its sub-commands.
 */

import { describe, expect, it } from "vitest";
import { runCli } from "./utils.js";

/**
 * Get combined output from CLI result.
 * Help output may go to stdout or stderr depending on the execution path.
 */
function getOutput(result: { stdout: string; stderr: string }): string {
  return result.stdout + result.stderr;
}

describe("axm-spike tui", () => {
  describe("--help", () => {
    it("shows all sub-commands", async () => {
      const result = await runCli(["tui", "--help"]);
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
      const result = await runCli(["tui", "log"]);

      expect(result.exitCode).toBe(0);
    });

    it("displays all log variants", async () => {
      const result = await runCli(["tui", "log"]);
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
      const result = await runCli(["tui", "spinner"], { timeout: 10000 });

      expect(result.exitCode).toBe(0);
    });

    it("displays completion message", async () => {
      const result = await runCli(["tui", "spinner"], { timeout: 10000 });
      const output = getOutput(result);

      expect(output).toContain("Done loading!");
    });
  });

  describe("tui note", () => {
    it("exits with code 0", async () => {
      const result = await runCli(["tui", "note"]);

      expect(result.exitCode).toBe(0);
    });

    it("displays note output", async () => {
      const result = await runCli(["tui", "note"]);
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
      const result = await runCli(["tui", command, "--help"]);
      const output = getOutput(result);

      expect(result.exitCode).toBe(0);
      expect(output).toContain(description);
    });
  });
});
