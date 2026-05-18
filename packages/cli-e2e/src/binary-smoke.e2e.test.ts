import { createBinaryRunner, createTempDir } from "@agentxm/client-e2e-utils";
import { describe, expect, it } from "vitest";

import { resolveBinaryPath } from "./distribution-targets.js";

const binaryPath = resolveBinaryPath();

const runBinary = createBinaryRunner(binaryPath);

const getOutput = (result: { readonly stdout: string; readonly stderr: string }): string =>
  result.stdout + result.stderr;

describe("compiled binary smoke", () => {
  it("exits 0 with --version and prints a semver", async () => {
    const result = await runBinary(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^\d+\.\d+\.\d+(?:[-+][^\s]+)?$/);
  });

  it("exits 0 with --help and prints usage", async () => {
    const result = await runBinary(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(getOutput(result)).toContain("USAGE\n  axm <command> [flags]");
    expect(getOutput(result)).toContain("CORE");
  });

  it("exits non-zero for auth token without credentials", async () => {
    const result = await runBinary(["auth", "token"]);

    expect(result.exitCode).toBe(4);
    expect(getOutput(result)).toContain("(auth)");
    expect(getOutput(result)).toContain("Set the AXM_TOKEN environment variable");
  });

  it("exits non-zero with an explicit init instruction for skills disable in an uninitialized workspace", async () => {
    const temp = createTempDir();

    try {
      const result = await runBinary(
        ["--non-interactive", "skills", "disable", "fake-skill", "--yes"],
        {
          cwd: temp.path,
        },
      );

      expect(result.exitCode).toBe(10);
      expect(getOutput(result)).toContain("Workspace settings not found");
      expect(getOutput(result)).toContain("axm setup");
    } finally {
      temp.cleanup();
    }
  });
});
