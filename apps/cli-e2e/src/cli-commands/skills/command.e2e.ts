/**
 * E2E tests for the `axm skills` command.
 */

import { describe, expect, it } from "vitest";
import { runCli } from "../../e2e/utils.js";

describe("axm skills", () => {
  describe("without subcommand", () => {
    it("shows help and exits cleanly", async () => {
      const result = await runCli(["skills"]);

      // Per spec: exits with code 0 and shows help
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Manage skills");
    });

    it("shows available subcommands", async () => {
      const result = await runCli(["skills"]);

      // Should mention the install subcommand in output
      expect(result.stdout).toMatch(/install/i);
    });
  });

  describe("--help", () => {
    it("displays usage information", async () => {
      const result = await runCli(["skills", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Manage skills");
    });

    it("shows install subcommand", async () => {
      const result = await runCli(["skills", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("install");
    });

    it("shows usage examples", async () => {
      const result = await runCli(["skills", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("EXAMPLES");
    });
  });

  describe("skills install --help", () => {
    it("displays install subcommand usage", async () => {
      const result = await runCli(["skills", "install", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Reinstall configured skills");
    });
  });
});
