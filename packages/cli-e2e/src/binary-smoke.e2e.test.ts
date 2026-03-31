import { createBinaryRunner, createTempDir } from "@axm.sh/e2e-utils";
import { describe, expect, it } from "vitest";

const binaryPath = process.env["AXM_BINARY_PATH"];

if (binaryPath === undefined || binaryPath.length === 0) {
  throw new Error("AXM_BINARY_PATH is required for binary smoke tests");
}

const runBinary = createBinaryRunner(binaryPath);

const getOutput = (result: { readonly stdout: string; readonly stderr: string }): string =>
  result.stdout + result.stderr;

describe("compiled binary smoke", () => {
  it("exits 0 with --version and prints a semver", async () => {
    const result = await runBinary(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^axm v\d+\.\d+\.\d+(?:[-+][^\s]+)?$/);
  });

  it("exits 0 with --help and prints usage", async () => {
    const result = await runBinary(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(getOutput(result)).toContain("USAGE");
    expect(getOutput(result)).toContain("axm <subcommand> [flags]");
  });

  it("exits non-zero for auth token without credentials", async () => {
    const result = await runBinary(["auth", "token"]);

    expect(result.exitCode).toBe(1);
    expect(getOutput(result)).toContain("AUTH_LOGIN_REQUIRED");
    expect(getOutput(result)).toContain("No token available");
  });

  it("exits non-zero for skills disable on a missing skill", async () => {
    const temp = createTempDir();

    try {
      const result = await runBinary(
        ["--non-interactive", "skills", "disable", "fake-skill", "--yes"],
        {
          cwd: temp.path,
        },
      );

      expect(result.exitCode).toBe(1);
      expect(getOutput(result)).toContain("SKILL_NOT_FOUND");
      expect(getOutput(result)).toContain("fake-skill");
    } finally {
      temp.cleanup();
    }
  });
});
