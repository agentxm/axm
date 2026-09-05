import "./cli-commands/json-channel-contract.e2e.js";
import "./cli-commands/structured-output.e2e.js";

import { describe, expect, it } from "vitest";

import { runCli } from "./utils.js";

/**
 * Binds this file's evidence to the requirement identities it executes at the
 * process boundary. The literal shape is read by the specification catalog;
 * cli-e2e deliberately has no code dependency on the specifications package.
 */
export const executionBinding = {
  requirements: [
    "cli/machine-errors-use-the-stable-envelope",
    "cli/errors-do-not-disclose-credentials",
  ],
  boundary: "process",
  rationale:
    "Observes the shipped process streams under --json: exactly one stdout document per invocation, NDJSON diagnostics on stderr, and the redacted error envelope for failing and defect invocations — channel separation the in-memory renderer capture cannot prove.",
} as const;

describe("cli smoke", () => {
  it("exits non-zero for an unknown command", async () => {
    const result = await runCli(["nonexistent-command"]);
    expect(result.exitCode).not.toBe(0);
  });
});
