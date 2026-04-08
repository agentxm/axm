import { describe, expect, it } from "vitest";

import { runCli } from "./utils.js";

describe("cli-spike smoke", () => {
  it("exits 0 with --help", async () => {
    const result = await runCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("axm-spike");
  });

  it("exits 0 with --version", async () => {
    const result = await runCli(["--version"]);
    expect(result.exitCode).toBe(0);
  });

  it("shows subcommands in help output", async () => {
    const result = await runCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("pets");
    expect(result.stdout).toContain("telemetry");
  });

  it("exits non-zero for unknown command", async () => {
    const result = await runCli(["nonexistent"]);
    expect(result.exitCode).not.toBe(0);
  });
});
