/**
 * E2E tests for the `axm` root command.
 */

import { describe, expect, it } from "vitest";
import { runCli } from "./e2e/utils.js";

/**
 * Get combined output from CLI result.
 * Help output may go to stdout (--help) or stderr (yargs showHelp).
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

      expect(output).toContain("Examples:");
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
