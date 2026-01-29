/**
 * E2E tests for the `axm skills` command.
 */

import { describe, expect, it } from "vitest";
import { runCli } from "./utils.js";

describe("axm skills", () => {
  describe("without subcommand", () => {
    it("shows error and available subcommands", async () => {
      const result = await runCli(["skills"]);

      // Should exit with error due to demandCommand
      expect(result.exitCode).not.toBe(0);

      // Should indicate a subcommand is required
      expect(result.stderr).toContain("Please specify a sub-command");
    });

    it("shows available subcommands in help hint", async () => {
      const result = await runCli(["skills"]);

      // Should mention the add subcommand in output
      expect(result.stderr).toMatch(/add/i);
    });
  });

  describe("--help", () => {
    it("displays usage information", async () => {
      const result = await runCli(["skills", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Manage skills");
    });

    it("shows add subcommand", async () => {
      const result = await runCli(["skills", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("add");
    });

    it("shows usage examples", async () => {
      const result = await runCli(["skills", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Examples:");
    });
  });

  describe("skills add --help", () => {
    it("displays add subcommand usage", async () => {
      const result = await runCli(["skills", "add", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Add skills");
    });
  });
});
