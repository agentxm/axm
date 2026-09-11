import { describe, expect, it } from "vitest";

import { interruptOnFirstRegistryRequest } from "./e2e/interruption.js";
import { createTempDir, runCli } from "./e2e/utils.js";

/**
 * Binds this file's evidence to the requirement identities it executes at the
 * process boundary. The literal shape is read by the specification catalog.
 */
export const executionBinding = {
  requirements: ["cli/interruption-preserves-authority-and-reports-recovery"],
  boundary: "process",
  rationale:
    "Delivers a real signal to the built binary mid-acquisition, so the terminal document, its durable-state disposition, and the signal exit code are observed from outside the process rather than derived from a journal in memory.",
} as const;

describe("signal interruption", () => {
  it("C-15: interrupting a plan-family apply resolves an interrupted document and exit 130", async () => {
    const workspace = createTempDir();
    const userHome = createTempDir();
    try {
      const setup = await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code"],
        { cwd: workspace.path },
      );
      expect(setup.exitCode, setup.stderr).toBe(0);

      const result = await interruptOnFirstRegistryRequest(
        ["install", "@test/skills/interrupt", "--json"],
        { cwd: workspace.path, userHome: userHome.path },
      );

      expect(result.code, result.stdout + result.stderr).toBe(130);
      const document = JSON.parse(result.stdout);
      expect(document.ok).toBe(false);
      expect(document.result.contract).toBe("plan-result-v3");
      expect(document.result.outcome).toBe("interrupted");
      expect(document.result.interruption).toEqual({ signal: "SIGINT", disposition: "none" });
    } finally {
      userHome.cleanup();
      workspace.cleanup();
    }
  });

  it("interrupting a read command reports the termination on stderr and exits 130", async () => {
    const workspace = createTempDir();
    try {
      const result = await interruptOnFirstRegistryRequest(
        ["view", "@test/skills/interrupt", "--json"],
        { cwd: workspace.path, userHome: workspace.path },
      );

      expect(result.code, result.stdout + result.stderr).toBe(130);
      // A command with no operation boundary resolves nothing itself: no
      // stdout envelope, just the machine-readable termination notice.
      expect(result.stdout.trim()).toBe("");
      const diagnostics = result.stderr
        .trim()
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line));
      expect(diagnostics).toContainEqual({
        type: "error",
        code: "interrupted",
        message: "Cancelled by SIGINT.",
        reason: "interrupted",
        signal: "SIGINT",
      });
    } finally {
      workspace.cleanup();
    }
  });
});
