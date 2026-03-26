import "./command.e2e.js";
import "./cli-commands/structured-output.e2e.js";

import { describe, expect, it } from "vitest";

import { runCli } from "./utils.js";

describe("cli smoke", () => {
  it("exits 0 with --version", async () => {
    const result = await runCli(["--version"]);
    expect(result.exitCode).toBe(0);
  });

  it("exits non-zero for an unknown command", async () => {
    const result = await runCli(["nonexistent-command"]);
    expect(result.exitCode).not.toBe(0);
  });
});
