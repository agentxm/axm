import { describe, expect, it } from "vitest";
import { runCli } from "./e2e/utils.js";

const getOutput = (result: { stdout: string; stderr: string }) => result.stdout + result.stderr;

describe("main CLI", () => {
  it("shows help and exits 1 without arguments", async () => {
    const result = await runCli([]);
    const output = getOutput(result);

    expect(result.exitCode).toBe(1);
    expect(output).toContain("Open extension manager for AI coding agents.");
    expect(output).toContain("skills");
    expect(output).toContain("packs");
    expect(output).toContain("commands");
    expect(output).toContain("mcp-servers");
    expect(output).toContain("auth");
  });

  it("shows root help examples", async () => {
    const result = await runCli(["--help"]);
    const output = getOutput(result);

    expect(result.exitCode).toBe(0);
    expect(output).toContain("EXAMPLES");
    expect(output).toContain("axm init");
    expect(output).toContain("axm skills install owner/repo");
    expect(output).toContain("axm login");
  });

  it.each([
    { args: ["skills"], expected: ["install", "list", "publish"] },
    { args: ["packs"], expected: ["install", "publish", "unpack"] },
    { args: ["commands"], expected: ["install", "uninstall"] },
    { args: ["mcp-servers"], expected: ["install", "uninstall"] },
    { args: ["auth"], expected: ["login", "whoami", "token"] },
  ])("shows group help for $args", async ({ args, expected }) => {
    const result = await runCli(args);
    const output = getOutput(result);

    expect(result.exitCode).toBe(0);
    for (const text of expected) {
      expect(output).toContain(text);
    }
  });

  it.each([
    { args: ["init", "--help"], expected: ["--scope", "--agent"] },
    { args: ["whoami", "--help"], expected: ["--json"] },
    { args: ["skills", "install", "--help"], expected: ["--skill", "--all"] },
    { args: ["skills", "ls", "--help"], expected: ["List installed skills"] },
    { args: ["packs", "unpack", "--help"], expected: ["--strict-agent-sync"] },
    { args: ["commands", "install", "--help"], expected: ["--scope"] },
    { args: ["mcp-servers", "install", "--help"], expected: ["--scope"] },
  ])("shows leaf help for $args", async ({ args, expected }) => {
    const result = await runCli(args);
    const output = getOutput(result);

    expect(result.exitCode).toBe(0);
    for (const text of expected) {
      expect(output).toContain(text);
    }
  });
});

describe("error formatting", () => {
  it("extracts message from Error objects when msg is null", () => {
    const err = new Error("something went wrong");
    const msg: string | null = null;
    const formatted = msg ?? (err instanceof Error ? err.message : String(err));
    expect(formatted).toBe("something went wrong");
  });

  it("stringifies non-Error values when msg is null", () => {
    const err: unknown = "UNKNOWN_ERROR";
    const msg: string | null = null;
    const formatted = msg ?? (err instanceof Error ? err.message : String(err));
    expect(formatted).toBe("UNKNOWN_ERROR");
  });

  it("uses msg when it is provided", () => {
    const msg = "Not enough arguments";
    const err = new Error("ignored");
    const formatted = msg ?? (err instanceof Error ? err.message : String(err));
    expect(formatted).toBe("Not enough arguments");
  });
});
